const express = require('express');
const XLSX = require('xlsx');
const sheets = require('../services/sheets');
const { normalizeFurigana } = require('../utils/normalize');
const router = express.Router();

// 基本フィールドの定義（APIキー → シート列名）
const BASE_FIELDS = {
  name: '氏名',
  furigana: 'ふりがな',
  email: 'メールアドレス',
  phone: '携帯電話番号',
  company: '会社名',
  address: '住所',
  companyPhone: '会社電話番号',
  memberStatus: '入会ステータス',
  notes: '備考',
};

// システム管理列（UIに表示しない）
const SYSTEM_COLUMNS = new Set([
  'ID', '氏名', 'ふりがな', 'メールアドレス', '携帯電話番号',
  '会社名', '住所', '会社電話番号', '入会ステータス', '備考', '登録日', '更新日',
]);

/**
 * スプレッドシートのヘッダーから追加列（自由文フィールド）を検出
 * 基本列・システム列・カスタムフィールド列を除外
 */
function detectExtraFields(headers, customFieldNames) {
  return headers.filter(h =>
    !SYSTEM_COLUMNS.has(h) && !customFieldNames.includes(h)
  );
}

/**
 * スプレッドシートで直接追加された行のID・登録日・更新日を自動補完
 * 空欄の場合のみ補完し、シートに書き戻す
 * バッチ処理で1行ずつ順次更新（API rate limit対策）
 */
async function autoFillMembers(data) {
  const now = new Date().toISOString();
  const updates = [];

  for (const m of data) {
    const fills = {};
    if (!m['ID']) {
      fills['ID'] = sheets.generateId();
      m['ID'] = fills['ID'];
    }
    if (!m['登録日']) {
      fills['登録日'] = now;
      m['登録日'] = fills['登録日'];
    }
    if (!m['更新日']) {
      fills['更新日'] = now;
      m['更新日'] = fills['更新日'];
    }
    if (Object.keys(fills).length > 0) {
      updates.push({ rowIndex: m._rowIndex, member: m });
    }
  }

  // ID・登録日・更新日のみを個別セル更新（行全体を上書きしない安全な方法）
  for (const { rowIndex, member } of updates) {
    try {
      if (member['ID']) await sheets.updateCell('会員名簿', rowIndex, 'ID', member['ID']);
      if (member['登録日']) await sheets.updateCell('会員名簿', rowIndex, '登録日', member['登録日']);
      if (member['更新日']) await sheets.updateCell('会員名簿', rowIndex, '更新日', member['更新日']);
    } catch (err) {
      console.error('Auto-fill write-back error:', err);
    }
  }

  return data;
}

/**
 * 会員データをAPIレスポンス形式に変換（カスタムフィールド含む）
 */
function formatMember(m, customFields, extraFields) {
  const result = {
    id: m['ID'],
    name: m['氏名'],
    furigana: m['ふりがな'],
    email: m['メールアドレス'],
    phone: m['携帯電話番号'],
    company: m['会社名'],
    address: m['住所'],
    companyPhone: m['会社電話番号'],
    memberStatus: m['入会ステータス'],
    notes: m['備考'],
    createdAt: m['登録日'],
    updatedAt: m['更新日'],
    _rowIndex: m._rowIndex,
    customFields: {},
    extraFields: {},
  };
  // カスタムフィールド（ドロップダウン）の値
  customFields.forEach(cf => {
    result.customFields[cf.id] = m[cf.name] || '';
  });
  // 追加列（自由文テキスト）の値
  extraFields.forEach(col => {
    result.extraFields[col] = m[col] || '';
  });
  return result;
}

/**
 * GET /api/members - 会員一覧
 * 各会員の直近イベント参加情報を付与
 */
router.get('/', async (req, res) => {
  try {
    const { headers, data } = await sheets.getSheetData('会員名簿');
    await autoFillMembers(data);
    const customFields = await sheets.getCustomFields();
    const extraFields = detectExtraFields(headers, customFields.map(cf => cf.name));

    // イベント参加情報を取得
    const { data: events } = await sheets.getSheetData('イベント');
    const { data: attendanceData } = await sheets.getSheetData('イベント出席');

    // イベントIDから情報を引けるようにする
    const eventMap = {};
    events.forEach(e => { eventMap[e['ID']] = e; });

    // イベント一覧（日付降順）
    const eventList = events
      .map(e => ({
        id: e['ID'],
        name: e['イベント名'],
        type: e['種類'] || '',
        date: e['日時'] || '',
      }))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // 会員ID → 全参加イベント一覧（日付降順）
    const memberEvents = {};
    attendanceData.forEach(a => {
      const mid = a['会員ID'];
      if (!mid) return;
      if (!memberEvents[mid]) memberEvents[mid] = [];
      const ev = eventMap[a['イベントID']];
      memberEvents[mid].push({
        eventId: a['イベントID'],
        eventName: ev ? ev['イベント名'] : '',
        eventDate: ev ? ev['日時'] : '',
        eventType: ev ? ev['種類'] : '',
        status: a['出席状態'],
      });
    });
    for (const mid of Object.keys(memberEvents)) {
      memberEvents[mid].sort((a, b) => (b.eventDate || '').localeCompare(a.eventDate || ''));
    }

    const members = data.map(m => {
      const fm = formatMember(m, customFields, extraFields);
      fm.allEvents = memberEvents[m['ID']] || [];
      fm.recentEvents = (memberEvents[m['ID']] || []).slice(0, 3);
      return fm;
    });
    res.json({ members, customFields, extraFields, eventList });
  } catch (err) {
    console.error('Get members error:', err);
    res.status(500).json({ error: '会員一覧の取得に失敗しました' });
  }
});

/**
 * GET /api/members/export-fields - エクスポート可能な列の一覧
 * 注意: /:id より前に定義する必要あり
 */
router.get('/export-fields', async (req, res) => {
  try {
    const { headers: memberHeaders } = await sheets.getSheetData('会員名簿');
    const customFields = await sheets.getCustomFields();
    const customNames = new Set(customFields.map(cf => cf.name));
    const basicSet = new Set(Object.values(BASE_FIELDS));
    const systemSet = new Set(['ID', '登録日', '更新日']);

    const basic = [];
    const custom = [];
    const extra = [];
    for (const h of memberHeaders) {
      if (systemSet.has(h)) continue;
      const col = { key: `member:${h}`, label: h };
      if (customNames.has(h)) custom.push(col);
      else if (basicSet.has(h)) basic.push(col);
      else extra.push(col);
    }

    // 全イベント（日時降順）
    const { data: events } = await sheets.getSheetData('イベント');
    const eventCols = events
      .map(e => ({
        key: `event:${e['ID']}`,
        label: e['イベント名'] || '',
        date: e['日時'] || '',
        type: e['種類'] || '',
      }))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    res.json({ basic, custom, extra, events: eventCols });
  } catch (err) {
    console.error('Get member export fields error:', err);
    res.status(500).json({ error: 'エクスポート列の取得に失敗しました' });
  }
});

/**
 * POST /api/members/export - 会員名簿をExcel(xlsx)としてエクスポート
 * body: {
 *   memberIds?: string[],   // 指定があればその順序・絞り込みでエクスポート
 *   columns: [{ key, label }]
 * }
 */
router.post('/export', async (req, res) => {
  try {
    const { columns, memberIds } = req.body;
    if (!Array.isArray(columns) || columns.length === 0) {
      return res.status(400).json({ error: '出力する列を選択してください' });
    }

    const { data: members } = await sheets.getSheetData('会員名簿');
    const { data: attendance } = await sheets.getSheetData('イベント出席');

    const memberById = {};
    members.forEach(m => { memberById[m['ID']] = m; });

    // memberIds 指定があればその順序を保つ、なければふりがな順
    let target;
    if (Array.isArray(memberIds) && memberIds.length > 0) {
      target = memberIds.map(id => memberById[id]).filter(Boolean);
    } else {
      target = [...members].sort(
        (a, b) => (a['ふりがな'] || '').localeCompare(b['ふりがな'] || '', 'ja')
      );
    }

    // 出席ルックアップ: memberId → eventId → 出席状態
    const attBy = {};
    attendance.forEach(a => {
      const mid = a['会員ID'];
      const eid = a['イベントID'];
      if (!mid || !eid) return;
      if (!attBy[mid]) attBy[mid] = {};
      attBy[mid][eid] = a['出席状態'];
    });

    const headerRow = columns.map(c => c.label || '');
    const dataRows = target.map(m => columns.map(col => {
      const sep = col.key.indexOf(':');
      if (sep < 0) return '';
      const source = col.key.slice(0, sep);
      const field = col.key.slice(sep + 1);
      if (source === 'member') {
        return m[field] || '';
      }
      if (source === 'event') {
        const status = attBy[m['ID']]?.[field];
        // 「参加」= 出席 または 遅刻
        return (status === '出席' || status === '遅刻') ? '○' : '';
      }
      return '';
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    XLSX.utils.book_append_sheet(wb, ws, '会員名簿');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `会員名簿_${dateStr}.xlsx`;
    const encoded = encodeURIComponent(filename);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="members.xlsx"; filename*=UTF-8''${encoded}`
    );
    res.send(buffer);
  } catch (err) {
    console.error('Member export error:', err);
    res.status(500).json({ error: err.message || 'エクスポートに失敗しました' });
  }
});

/**
 * GET /api/members/:id - 会員詳細
 * イベント参加履歴を全件付与
 */
router.get('/:id', async (req, res) => {
  try {
    const { headers, data } = await sheets.getSheetData('会員名簿');
    await autoFillMembers(data);
    const customFields = await sheets.getCustomFields();
    const extraFields = detectExtraFields(headers, customFields.map(cf => cf.name));
    const member = data.find(m => m['ID'] === req.params.id);
    if (!member) return res.status(404).json({ error: '会員が見つかりません' });

    // イベント参加履歴
    const { data: events } = await sheets.getSheetData('イベント');
    const { data: attendance } = await sheets.getSheetData('イベント出席');
    const eventMap = {};
    events.forEach(e => { eventMap[e['ID']] = e; });

    const memberAttendance = attendance
      .filter(a => a['会員ID'] === req.params.id)
      .map(a => {
        const ev = eventMap[a['イベントID']];
        return {
          attendanceId: a['ID'],
          eventId: a['イベントID'],
          eventName: ev ? ev['イベント名'] : '',
          eventDate: ev ? ev['日時'] : '',
          eventType: ev ? ev['種類'] : '',
          status: a['出席状態'],
          notes: a['備考'],
        };
      })
      .sort((a, b) => (b.eventDate || '').localeCompare(a.eventDate || ''));

    res.json({
      member: formatMember(member, customFields, extraFields),
      customFields,
      extraFields,
      eventHistory: memberAttendance,
    });
  } catch (err) {
    console.error('Get member error:', err);
    res.status(500).json({ error: '会員情報の取得に失敗しました' });
  }
});

/**
 * POST /api/members - 会員追加
 */
router.post('/', async (req, res) => {
  try {
    const id = sheets.generateId();
    const now = new Date().toISOString();
    const rowData = {
      'ID': id,
      '登録日': now,
      '更新日': now,
    };

    // 基本フィールド
    Object.entries(BASE_FIELDS).forEach(([apiKey, sheetCol]) => {
      let val = req.body[apiKey] || '';
      // ふりがなはひらがなに正規化（カタカナ→ひらがな、日本語名はスペース除去）
      if (apiKey === 'furigana') val = normalizeFurigana(val);
      rowData[sheetCol] = val;
    });

    // カスタムフィールド（ドロップダウン）
    const customFields = await sheets.getCustomFields();
    if (req.body.customFields) {
      customFields.forEach(cf => {
        rowData[cf.name] = req.body.customFields[cf.id] || '';
      });
    }

    // 追加列（自由文テキスト）
    if (req.body.extraFields) {
      Object.entries(req.body.extraFields).forEach(([col, val]) => {
        if (!SYSTEM_COLUMNS.has(col)) {
          rowData[col] = val || '';
        }
      });
    }

    await sheets.appendRow('会員名簿', rowData);
    res.json({ success: true, id });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ error: '会員の追加に失敗しました' });
  }
});

/**
 * PUT /api/members/:id - 会員更新
 */
router.put('/:id', async (req, res) => {
  try {
    const { data } = await sheets.getSheetData('会員名簿');
    const member = data.find(m => m['ID'] === req.params.id);
    if (!member) return res.status(404).json({ error: '会員が見つかりません' });

    const now = new Date().toISOString();
    const updatedData = { ...member, '更新日': now };

    // 基本フィールド
    Object.entries(BASE_FIELDS).forEach(([apiKey, sheetCol]) => {
      if (req.body[apiKey] !== undefined) {
        let val = req.body[apiKey];
        // ふりがなはひらがなに正規化（カタカナ→ひらがな、日本語名はスペース除去）
        if (apiKey === 'furigana') val = normalizeFurigana(val);
        updatedData[sheetCol] = val;
      }
    });

    // カスタムフィールド（ドロップダウン）
    const customFields = await sheets.getCustomFields();
    if (req.body.customFields) {
      customFields.forEach(cf => {
        if (req.body.customFields[cf.id] !== undefined) {
          updatedData[cf.name] = req.body.customFields[cf.id];
        }
      });
    }

    // 追加列（自由文テキスト）
    if (req.body.extraFields) {
      Object.entries(req.body.extraFields).forEach(([col, val]) => {
        if (!SYSTEM_COLUMNS.has(col) && val !== undefined) {
          updatedData[col] = val;
        }
      });
    }

    await sheets.updateRow('会員名簿', member._rowIndex, updatedData);
    res.json({ success: true });
  } catch (err) {
    console.error('Update member error:', err);
    res.status(500).json({ error: '会員情報の更新に失敗しました' });
  }
});

/**
 * PATCH /api/members/:id/status - ステータスのインライン編集
 * field: '入会ステータス' or カスタムフィールド名
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const { data } = await sheets.getSheetData('会員名簿');
    const member = data.find(m => m['ID'] === req.params.id);
    if (!member) return res.status(404).json({ error: '会員が見つかりません' });

    const { field, value } = req.body;
    // 入会ステータスまたはカスタムフィールドのみ許可
    const customFields = await sheets.getCustomFields();
    const allowed = ['入会ステータス', ...customFields.map(cf => cf.name)];
    if (!allowed.includes(field)) {
      return res.status(400).json({ error: '無効なフィールドです' });
    }

    // Update field and timestamp in one row update (saves API calls)
    const updatedData = { ...member, [field]: value, '更新日': new Date().toISOString() };
    await sheets.updateRow('会員名簿', member._rowIndex, updatedData);
    res.json({ success: true });
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ error: 'ステータスの更新に失敗しました' });
  }
});

/**
 * DELETE /api/members/:id - 会員削除
 */
router.delete('/:id', async (req, res) => {
  try {
    const { data } = await sheets.getSheetData('会員名簿');
    const member = data.find(m => m['ID'] === req.params.id);
    if (!member) return res.status(404).json({ error: '会員が見つかりません' });
    await sheets.deleteRow('会員名簿', member._rowIndex);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete member error:', err);
    res.status(500).json({ error: '会員の削除に失敗しました' });
  }
});

module.exports = router;
