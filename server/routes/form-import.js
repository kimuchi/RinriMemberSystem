/**
 * フォーム連携ルーター
 * Googleフォームの回答スプレッドシートからイベント出席を取り込む
 */
const express = require('express');
const sheets = require('../services/sheets');
const { normalizeName, normalizeFurigana } = require('../utils/normalize');
const router = express.Router({ mergeParams: true });

const FORM_CONFIG_SHEET = 'フォーム連携設定';
const FORM_CONFIG_HEADERS = ['イベントID', 'スプレッドシートID', 'シート名', 'マッピング'];

// 新規列名として禁止する名前（システム列との衝突防止）
const MEMBER_SYSTEM_COLUMNS = new Set([
  'ID', '氏名', 'ふりがな', 'メールアドレス', '携帯電話番号',
  '会社名', '住所', '会社電話番号', '入会ステータス', '備考', '登録日', '更新日',
]);
const ATTENDANCE_BASE_COLUMNS = new Set([
  'ID', 'イベントID', '会員ID', '氏名', '出席状態', '備考',
]);

/**
 * fieldMap の値を { kind, column } にパース
 * 例: "member:氏名" / "attendance:懇親会"
 * 後方互換: プレフィックスなしの値は会員名簿列とみなす
 */
function parseMapTarget(value) {
  if (!value) return null;
  const idx = value.indexOf(':');
  if (idx < 0) return { kind: 'member', column: value };
  const kind = value.slice(0, idx);
  const column = value.slice(idx + 1);
  if (kind !== 'member' && kind !== 'attendance') {
    return { kind: 'member', column: value }; // 不明 prefix は member 扱い
  }
  return { kind, column };
}

/**
 * スプレッドシートURLまたはIDからスプレッドシートIDを抽出
 */
function extractSpreadsheetId(input) {
  if (!input) return '';
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : input.trim();
}

/**
 * フォーム連携設定シートを確保
 */
async function ensureConfigSheet() {
  await sheets.ensureSheet(FORM_CONFIG_SHEET, FORM_CONFIG_HEADERS);
}

/**
 * イベントのフォーム設定を取得
 */
async function getFormConfig(eventId) {
  const { data } = await sheets.getSheetData(FORM_CONFIG_SHEET);
  return data.find(d => d['イベントID'] === eventId) || null;
}

/**
 * GET /form - フォーム連携設定を取得
 */
router.get('/', async (req, res) => {
  try {
    await ensureConfigSheet();
    const config = await getFormConfig(req.params.id);
    if (!config) return res.json({ linked: false });

    let mapping = {};
    try { mapping = JSON.parse(config['マッピング'] || '{}'); } catch (e) {}

    res.json({
      linked: true,
      spreadsheetId: config['スプレッドシートID'],
      sheetName: config['シート名'],
      mapping,
      _rowIndex: config._rowIndex,
    });
  } catch (err) {
    console.error('Get form config error:', err);
    res.status(500).json({ error: 'フォーム連携設定の取得に失敗しました' });
  }
});

/**
 * POST /form/connect - フォームスプレッドシートに接続してヘッダーとシート名を返す
 */
router.post('/connect', async (req, res) => {
  try {
    const spreadsheetId = extractSpreadsheetId(req.body.spreadsheetId);
    if (!spreadsheetId) return res.status(400).json({ error: 'スプレッドシートIDまたはURLを入力してください' });

    const sheetNames = await sheets.getExternalSheetNames(spreadsheetId);

    // 最初のシートのヘッダーを取得
    const targetSheet = req.body.sheetName || sheetNames[0];
    const { headers } = await sheets.getExternalSheetData(spreadsheetId, targetSheet);

    // 会員名簿のヘッダーも返す（マッピング先候補）
    const { headers: memberHeaders } = await sheets.getSheetData('会員名簿');
    // イベント出席シートの自由列も返す
    const attendanceFields = await sheets.getAttendanceExtraColumns();

    res.json({
      spreadsheetId,
      sheetNames,
      selectedSheet: targetSheet,
      formHeaders: headers,
      memberFields: memberHeaders.filter(h => h !== 'ID' && h !== '登録日' && h !== '更新日'),
      attendanceFields,
    });
  } catch (err) {
    console.error('Form connect error:', err);
    res.status(500).json({ error: err.message || 'スプレッドシートへの接続に失敗しました' });
  }
});

/**
 * PUT /form/mapping - フィールドマッピングを保存
 * body: {
 *   spreadsheetId, sheetName, mapping,
 *   newColumns?: string[]  // 会員名簿に追加する新規列名
 * }
 */
router.put('/mapping', async (req, res) => {
  try {
    await ensureConfigSheet();
    const {
      spreadsheetId,
      sheetName,
      mapping,
      newColumns,
      newAttendanceColumns,
    } = req.body;
    if (!spreadsheetId || !sheetName) {
      return res.status(400).json({ error: 'スプレッドシートIDとシート名は必須です' });
    }

    // 新規列を会員名簿に追加
    const addedColumns = [];
    if (Array.isArray(newColumns) && newColumns.length > 0) {
      const { headers: memberHeaders } = await sheets.getSheetData('会員名簿');
      const existingSet = new Set(memberHeaders);
      for (const raw of newColumns) {
        const name = (raw || '').trim();
        if (!name) continue;
        if (MEMBER_SYSTEM_COLUMNS.has(name)) continue;
        if (existingSet.has(name)) continue;
        await sheets.addColumnToSheet('会員名簿', name);
        existingSet.add(name);
        addedColumns.push(name);
      }
    }

    // 新規列をイベント出席シートに追加
    const addedAttendanceColumns = [];
    if (Array.isArray(newAttendanceColumns) && newAttendanceColumns.length > 0) {
      const { headers: attHeaders } = await sheets.getSheetData('イベント出席');
      const existingSet = new Set(attHeaders);
      for (const raw of newAttendanceColumns) {
        const name = (raw || '').trim();
        if (!name) continue;
        if (ATTENDANCE_BASE_COLUMNS.has(name)) continue;
        if (existingSet.has(name)) continue;
        await sheets.addColumnToSheet('イベント出席', name);
        existingSet.add(name);
        addedAttendanceColumns.push(name);
      }
    }

    const mappingJson = JSON.stringify(mapping);
    const existing = await getFormConfig(req.params.id);

    if (existing) {
      await sheets.updateRow(FORM_CONFIG_SHEET, existing._rowIndex, {
        'イベントID': req.params.id,
        'スプレッドシートID': spreadsheetId,
        'シート名': sheetName,
        'マッピング': mappingJson,
      });
    } else {
      await sheets.appendRow(FORM_CONFIG_SHEET, {
        'イベントID': req.params.id,
        'スプレッドシートID': spreadsheetId,
        'シート名': sheetName,
        'マッピング': mappingJson,
      });
    }

    res.json({ success: true, addedColumns, addedAttendanceColumns });
  } catch (err) {
    console.error('Save mapping error:', err);
    res.status(500).json({ error: 'マッピングの保存に失敗しました' });
  }
});

/**
 * DELETE /form - フォーム連携を解除
 */
router.delete('/', async (req, res) => {
  try {
    await ensureConfigSheet();
    const existing = await getFormConfig(req.params.id);
    if (existing) {
      await sheets.deleteRow(FORM_CONFIG_SHEET, existing._rowIndex);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'フォーム連携の解除に失敗しました' });
  }
});

/**
 * POST /form/preview - フォームデータの取り込みプレビュー
 * 名簿との照合・差分検出を行い、結果を返す
 */
router.post('/preview', async (req, res) => {
  try {
    await ensureConfigSheet();
    const config = await getFormConfig(req.params.id);
    if (!config) return res.status(400).json({ error: 'フォーム連携が設定されていません' });

    let mapping = {};
    try { mapping = JSON.parse(config['マッピング'] || '{}'); } catch (e) {}

    const { fieldMap, nameField, participationField, skipValues } = mapping;
    if (!fieldMap || !nameField) {
      return res.status(400).json({ error: 'フィールドマッピングが設定されていません' });
    }

    // フォームデータ読み込み
    const { data: formData } = await sheets.getExternalSheetData(
      config['スプレッドシートID'], config['シート名']
    );

    // 会員名簿読み込み
    const { data: members } = await sheets.getSheetData('会員名簿');

    // 既存出席データ
    const { data: attendance } = await sheets.getSheetData('イベント出席');
    const registeredMemberIds = new Set(
      attendance.filter(a => a['イベントID'] === req.params.id).map(a => a['会員ID'])
    );

    // 名前→会員のマップ（正規化済み）。氏名を優先し、別名は氏名で未登録のキーにのみ追加。
    const memberByName = {};
    for (const m of members) {
      const normalized = normalizeName(m['氏名']);
      if (normalized) memberByName[normalized] = m;
    }
    for (const m of members) {
      const alias = normalizeName(m['別名']);
      if (alias && !memberByName[alias]) memberByName[alias] = m;
    }

    const entries = [];
    let skipCount = 0;
    // 同一人物の重複検出用（正規化名 → 最初のformRow）
    const seenNames = {};

    for (const row of formData) {
      const formName = row[nameField] || '';
      const normalizedFormName = normalizeName(formName);

      // 参加フィールドチェック
      let participationType = '';
      let skip = false;
      if (participationField && row[participationField]) {
        const val = row[participationField];
        participationType = val;
        if (skipValues && skipValues.includes(val)) {
          skip = true;
          skipCount++;
          continue; // 不参加はスキップ
        }
      }

      // 名前で会員を検索
      const member = memberByName[normalizedFormName];

      // フォームデータを会員/出席フィールドにマッピング
      const mappedFormData = {};         // 会員名簿に書き込む値
      const mappedAttendanceData = {};   // イベント出席シートに書き込む値
      for (const [formCol, rawTarget] of Object.entries(fieldMap)) {
        if (formCol === nameField) continue; // 名前は別扱い
        if (!rawTarget || !row[formCol]) continue;
        const target = parseMapTarget(rawTarget);
        if (!target) continue;
        let value = row[formCol];
        if (target.kind === 'member') {
          if (target.column === '氏名' || target.column === 'ふりがな') {
            value = normalizeName(value);
          }
          mappedFormData[target.column] = value;
        } else if (target.kind === 'attendance') {
          mappedAttendanceData[target.column] = value;
        }
      }

      // 差分検出（会員名簿のみ。出席シートは新規登録扱い）
      const diffs = [];
      if (member) {
        for (const [field, formValue] of Object.entries(mappedFormData)) {
          const memberValue = member[field] || '';
          let compareForm = formValue;
          let compareMember = memberValue;
          // 氏名・ふりがなは正規化して比較（ふりがなはカタカナ→ひらがな変換も適用）
          if (field === '氏名') {
            compareForm = normalizeName(formValue);
            compareMember = normalizeName(memberValue);
          } else if (field === 'ふりがな') {
            compareForm = normalizeFurigana(formValue);
            compareMember = normalizeFurigana(memberValue);
          }
          if (compareForm && compareForm !== compareMember) {
            diffs.push({ field, formValue, memberValue });
          }
        }
      }

      // 重複検出（同一名の回答グループを記録）
      let duplicateGroup = null;
      if (normalizedFormName) {
        if (seenNames[normalizedFormName] !== undefined) {
          duplicateGroup = normalizedFormName;
        } else {
          seenNames[normalizedFormName] = row._rowIndex;
        }
      }

      entries.push({
        formRow: row._rowIndex,
        formName,
        normalizedName: normalizedFormName,
        matched: !!member,
        memberId: member ? member['ID'] : null,
        memberName: member ? member['氏名'] : null,
        participationType,
        alreadyRegistered: member ? registeredMemberIds.has(member['ID']) : false,
        duplicateGroup,
        diffs,
        mappedFormData,
        mappedAttendanceData,
      });
    }

    // 先の回答にもduplicateGroupを付与
    const dupNames = new Set(entries.filter(e => e.duplicateGroup).map(e => e.duplicateGroup));
    for (const entry of entries) {
      if (!entry.duplicateGroup && dupNames.has(entry.normalizedName)) {
        entry.duplicateGroup = entry.normalizedName;
      }
    }

    res.json({
      entries,
      skipCount,
      totalFormRows: formData.length,
    });
  } catch (err) {
    console.error('Form preview error:', err);
    res.status(500).json({ error: err.message || 'プレビューの生成に失敗しました' });
  }
});

/**
 * POST /form/execute - 取り込み実行
 * body: {
 *   entries: [{
 *     memberId, memberName, participationType,
 *     updates: { field: value },           // 会員名簿の差分更新
 *     attendanceData: { field: value },    // イベント出席シートの自由列
 *   }],
 *   newMembers: [{ name, participationType, fields, attendanceData }]
 * }
 */
router.post('/execute', async (req, res) => {
  try {
    const { entries, newMembers } = req.body;
    if ((!entries || entries.length === 0) && (!newMembers || newMembers.length === 0)) {
      return res.status(400).json({ error: '取り込む対象がありません' });
    }

    const eventId = req.params.id;
    let registeredCount = 0;
    let updatedCount = 0;
    let newMemberCount = 0;
    let skippedCount = 0;
    let attendanceColumnUpdatedCount = 0;

    // 既登録の出席データを取得（二重登録防止 + 既登録行への列更新用）
    const { data: existingAttendance } = await sheets.getSheetData('イベント出席');
    const existingByMember = {};
    existingAttendance.forEach(a => {
      if (a['イベントID'] === eventId && a['会員ID']) {
        existingByMember[a['会員ID']] = a;
      }
    });
    const alreadyRegistered = new Set(Object.keys(existingByMember));

    // ---- 1) 出席行をまとめて収集 ----
    const attendanceRows = [];
    // 既登録会員に対する出席シートの列更新（updateCellで個別）
    const attendanceColUpdates = []; // [{ rowIndex, field, value }]

    // 既存会員の出席登録（行データの収集のみ）
    for (const entry of (entries || [])) {
      const hasAttData = entry.attendanceData && Object.keys(entry.attendanceData).length > 0;
      if (alreadyRegistered.has(entry.memberId)) {
        skippedCount++;
        // 既登録だが出席シートの自由列に新情報がある場合は更新
        if (hasAttData) {
          const row = existingByMember[entry.memberId];
          for (const [field, value] of Object.entries(entry.attendanceData)) {
            if ((row[field] || '') !== String(value)) {
              attendanceColUpdates.push({ rowIndex: row._rowIndex, field, value });
            }
          }
        }
      } else {
        const newAttRow = {
          'ID': sheets.generateId(),
          'イベントID': eventId,
          '会員ID': entry.memberId,
          '氏名': entry.memberName,
          '出席状態': '事前登録',
          '備考': entry.participationType || '',
          ...(entry.attendanceData || {}),
        };
        attendanceRows.push(newAttRow);
        alreadyRegistered.add(entry.memberId);
        registeredCount++;
      }
    }

    // 既登録会員の出席シート自由列を更新（1回のバッチ書き込みにまとめる）
    if (attendanceColUpdates.length > 0) {
      await sheets.batchUpdateCells(
        'イベント出席',
        attendanceColUpdates.map(u => ({ rowIndex: u.rowIndex, columnName: u.field, value: u.value }))
      );
      attendanceColumnUpdatedCount += attendanceColUpdates.length;
    }

    // ---- 2) 会員情報の差分更新（バッチ化） ----
    const entriesWithUpdates = (entries || []).filter(
      e => e.updates && Object.keys(e.updates).length > 0
    );
    if (entriesWithUpdates.length > 0) {
      const { data: members } = await sheets.getSheetData('会員名簿');
      const now = new Date().toISOString();
      const batchUpdates = [];
      for (const entry of entriesWithUpdates) {
        const member = members.find(m => m['ID'] === entry.memberId);
        if (member) {
          const updatedData = { ...member, '更新日': now };
          for (const [field, value] of Object.entries(entry.updates)) {
            updatedData[field] = field === 'ふりがな' ? normalizeFurigana(value) : value;
          }
          batchUpdates.push({ rowIndex: member._rowIndex, rowData: updatedData });
          updatedCount++;
        }
      }
      if (batchUpdates.length > 0) {
        await sheets.batchUpdateRows('会員名簿', batchUpdates);
      }
    }

    // ---- 3) 新規会員をまとめて名簿に追加 ----
    const newMemberRows = [];
    const newMemberAttendanceRows = [];
    for (const nm of (newMembers || [])) {
      const memberId = sheets.generateId();
      const now = new Date().toISOString();
      const fields = { ...nm.fields };
      if (fields['ふりがな']) {
        fields['ふりがな'] = normalizeFurigana(fields['ふりがな']);
      }
      newMemberRows.push({
        'ID': memberId,
        '登録日': now,
        '更新日': now,
        '氏名': nm.name || '',
        ...fields,
      });
      newMemberAttendanceRows.push({
        'ID': sheets.generateId(),
        'イベントID': eventId,
        '会員ID': memberId,
        '氏名': nm.name || '',
        '出席状態': '事前登録',
        '備考': nm.participationType || '',
        ...(nm.attendanceData || {}),
      });
      newMemberCount++;
      registeredCount++;
    }

    // ---- 4) まとめて書き込み（API呼び出し最小化） ----
    if (newMemberRows.length > 0) {
      await sheets.appendRows('会員名簿', newMemberRows);
    }
    const allAttendanceRows = [...attendanceRows, ...newMemberAttendanceRows];
    if (allAttendanceRows.length > 0) {
      await sheets.appendRows('イベント出席', allAttendanceRows);
    }

    res.json({
      success: true,
      registeredCount,
      updatedCount,
      newMemberCount,
      skippedCount,
      attendanceColumnUpdatedCount,
    });
  } catch (err) {
    console.error('Form execute error:', err);
    res.status(500).json({ error: `取り込みに失敗しました: ${err.message}` });
  }
});

module.exports = router;
