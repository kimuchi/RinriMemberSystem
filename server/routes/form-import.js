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

    res.json({
      spreadsheetId,
      sheetNames,
      selectedSheet: targetSheet,
      formHeaders: headers,
      memberFields: memberHeaders.filter(h => h !== 'ID' && h !== '登録日' && h !== '更新日'),
    });
  } catch (err) {
    console.error('Form connect error:', err);
    res.status(500).json({ error: err.message || 'スプレッドシートへの接続に失敗しました' });
  }
});

/**
 * PUT /form/mapping - フィールドマッピングを保存
 */
router.put('/mapping', async (req, res) => {
  try {
    await ensureConfigSheet();
    const { spreadsheetId, sheetName, mapping } = req.body;
    if (!spreadsheetId || !sheetName) {
      return res.status(400).json({ error: 'スプレッドシートIDとシート名は必須です' });
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

    res.json({ success: true });
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

    // 名前→会員のマップ（正規化済み）
    const memberByName = {};
    for (const m of members) {
      const normalized = normalizeName(m['氏名']);
      if (normalized) memberByName[normalized] = m;
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

      // フォームデータを会員フィールドにマッピング
      const mappedFormData = {};
      for (const [formCol, memberCol] of Object.entries(fieldMap)) {
        if (formCol === nameField) continue; // 名前は別扱い
        if (memberCol && row[formCol]) {
          let value = row[formCol];
          // 氏名・ふりがなフィールドの正規化
          if (memberCol === '氏名') {
            value = normalizeName(value);
          } else if (memberCol === 'ふりがな') {
            value = normalizeName(value);
          }
          mappedFormData[memberCol] = value;
        }
      }

      // 差分検出
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
 *   entries: [{ memberId, memberName, participationType, updates: { field: value } }],
 *   newMembers: [{ name, participationType, fields: { memberCol: value } }]
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

    // 既存会員の出席登録
    for (const entry of (entries || [])) {
      const attId = sheets.generateId();
      await sheets.appendRow('イベント出席', {
        'ID': attId,
        'イベントID': eventId,
        '会員ID': entry.memberId,
        '氏名': entry.memberName,
        '出席状態': '事前登録',
        '備考': entry.participationType || '',
      });
      registeredCount++;

      // 会員情報の更新（個別セル更新で安全に）
      if (entry.updates && Object.keys(entry.updates).length > 0) {
        const { data: members } = await sheets.getSheetData('会員名簿');
        const member = members.find(m => m['ID'] === entry.memberId);
        if (member) {
          for (const [field, value] of Object.entries(entry.updates)) {
            const normalized = field === 'ふりがな' ? normalizeFurigana(value) : value;
            await sheets.updateCell('会員名簿', member._rowIndex, field, normalized);
          }
          await sheets.updateCell('会員名簿', member._rowIndex, '更新日', new Date().toISOString());
          updatedCount++;
        }
      }
    }

    // 新規会員の名簿追加 + 出席登録
    for (const nm of (newMembers || [])) {
      const memberId = sheets.generateId();
      const now = new Date().toISOString();
      // ふりがなを正規化（カタカナ→ひらがな、日本語名はスペース除去）
      const fields = { ...nm.fields };
      if (fields['ふりがな']) {
        fields['ふりがな'] = normalizeFurigana(fields['ふりがな']);
      }
      const memberData = {
        'ID': memberId,
        '登録日': now,
        '更新日': now,
        '氏名': nm.name || '',
        ...fields,
      };
      await sheets.appendRow('会員名簿', memberData);
      newMemberCount++;

      const attId = sheets.generateId();
      await sheets.appendRow('イベント出席', {
        'ID': attId,
        'イベントID': eventId,
        '会員ID': memberId,
        '氏名': nm.name || '',
        '出席状態': '事前登録',
        '備考': nm.participationType || '',
      });
      registeredCount++;
    }

    res.json({ success: true, registeredCount, updatedCount, newMemberCount });
  } catch (err) {
    console.error('Form execute error:', err);
    res.status(500).json({ error: '取り込みに失敗しました' });
  }
});

module.exports = router;
