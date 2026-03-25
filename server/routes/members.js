const express = require('express');
const sheets = require('../services/sheets');
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
      updates.push({ rowIndex: m._rowIndex, fills });
    }
  }

  // バックグラウンドでシートに書き戻す（レスポンスをブロックしない）
  if (updates.length > 0) {
    Promise.all(
      updates.flatMap(({ rowIndex, fills }) =>
        Object.entries(fills).map(([col, val]) =>
          sheets.updateCell('会員名簿', rowIndex, col, val)
        )
      )
    ).catch(err => console.error('Auto-fill write-back error:', err));
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
 */
router.get('/', async (req, res) => {
  try {
    const { headers, data } = await sheets.getSheetData('会員名簿');
    await autoFillMembers(data);
    const customFields = await sheets.getCustomFields();
    const extraFields = detectExtraFields(headers, customFields.map(cf => cf.name));
    const members = data.map(m => formatMember(m, customFields, extraFields));
    res.json({ members, customFields, extraFields });
  } catch (err) {
    console.error('Get members error:', err);
    res.status(500).json({ error: '会員一覧の取得に失敗しました' });
  }
});

/**
 * GET /api/members/:id - 会員詳細
 */
router.get('/:id', async (req, res) => {
  try {
    const { headers, data } = await sheets.getSheetData('会員名簿');
    await autoFillMembers(data);
    const customFields = await sheets.getCustomFields();
    const extraFields = detectExtraFields(headers, customFields.map(cf => cf.name));
    const member = data.find(m => m['ID'] === req.params.id);
    if (!member) return res.status(404).json({ error: '会員が見つかりません' });
    res.json({ member: formatMember(member, customFields, extraFields), customFields, extraFields });
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
      rowData[sheetCol] = req.body[apiKey] || '';
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
        updatedData[sheetCol] = req.body[apiKey];
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

    await sheets.updateCell('会員名簿', member._rowIndex, field, value);
    await sheets.updateCell('会員名簿', member._rowIndex, '更新日', new Date().toISOString());
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
