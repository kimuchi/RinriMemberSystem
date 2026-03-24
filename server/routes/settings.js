const express = require('express');
const sheets = require('../services/sheets');
const { ownerOnly } = require('../middleware/auth');
const router = express.Router();

// ============ ユーザー管理 ============

router.get('/users', ownerOnly, async (req, res) => {
  try {
    const { data } = await sheets.getSheetData('ユーザー');
    const users = data.map(u => ({
      id: u['ID'],
      email: u['メールアドレス'],
      name: u['表示名'],
      picture: u['Googleアカウント画像'],
      role: u['ロール'],
      createdAt: u['登録日'],
      _rowIndex: u._rowIndex,
    }));
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'ユーザー一覧の取得に失敗しました' });
  }
});

router.post('/users', ownerOnly, async (req, res) => {
  try {
    const { email, name, role } = req.body;
    if (!email) return res.status(400).json({ error: 'メールアドレスは必須です' });

    const { data } = await sheets.getSheetData('ユーザー');
    if (data.find(u => u['メールアドレス'] === email)) {
      return res.status(400).json({ error: 'このメールアドレスは既に登録されています' });
    }

    const id = sheets.generateId();
    await sheets.appendRow('ユーザー', {
      'ID': id, 'メールアドレス': email, '表示名': name || email,
      'Googleアカウント画像': '', 'ロール': role || 'member',
      '登録日': new Date().toISOString(),
    });
    await sheets.shareWithUser(email, 'writer');
    res.json({ success: true, id });
  } catch (err) {
    console.error('Add user error:', err);
    res.status(500).json({ error: 'ユーザーの追加に失敗しました' });
  }
});

router.delete('/users/:id', ownerOnly, async (req, res) => {
  try {
    const { data } = await sheets.getSheetData('ユーザー');
    const user = data.find(u => u['ID'] === req.params.id);
    if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    if (user['ロール'] === 'owner') {
      return res.status(400).json({ error: 'オーナーは削除できません' });
    }
    await sheets.revokeUserAccess(user['メールアドレス']);
    await sheets.deleteRow('ユーザー', user._rowIndex);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'ユーザーの削除に失敗しました' });
  }
});

// ============ 入会ステータス選択肢 ============

router.get('/statuses', async (req, res) => {
  try {
    const { data } = await sheets.getSheetData('入会ステータス選択肢');
    const statuses = data
      .sort((a, b) => (parseInt(a['表示順']) || 99) - (parseInt(b['表示順']) || 99))
      .map(s => ({ name: s['選択肢名'], order: s['表示順'], _rowIndex: s._rowIndex }));
    res.json({ statuses });
  } catch (err) {
    res.status(500).json({ error: 'ステータス選択肢の取得に失敗しました' });
  }
});

router.post('/statuses', ownerOnly, async (req, res) => {
  try {
    const { name, order } = req.body;
    if (!name) return res.status(400).json({ error: '選択肢名は必須です' });
    await sheets.appendRow('入会ステータス選択肢', { '選択肢名': name, '表示順': order || '99' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '選択肢の追加に失敗しました' });
  }
});

router.put('/statuses/:rowIndex', ownerOnly, async (req, res) => {
  try {
    const ri = parseInt(req.params.rowIndex);
    if (req.body.name !== undefined) await sheets.updateCell('入会ステータス選択肢', ri, '選択肢名', req.body.name);
    if (req.body.order !== undefined) await sheets.updateCell('入会ステータス選択肢', ri, '表示順', req.body.order);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '選択肢の更新に失敗しました' });
  }
});

router.delete('/statuses/:rowIndex', ownerOnly, async (req, res) => {
  try {
    await sheets.deleteRow('入会ステータス選択肢', parseInt(req.params.rowIndex));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '選択肢の削除に失敗しました' });
  }
});

// ============ カスタムフィールド ============

router.get('/custom-fields', async (req, res) => {
  try {
    const fields = await sheets.getCustomFields();
    // 各フィールドの選択肢も一括取得
    const result = [];
    for (const f of fields) {
      const options = await sheets.getCustomFieldOptions(f.id);
      result.push({ ...f, options });
    }
    res.json({ fields: result });
  } catch (err) {
    res.status(500).json({ error: 'カスタムフィールドの取得に失敗しました' });
  }
});

router.post('/custom-fields', ownerOnly, async (req, res) => {
  try {
    const { name, type, order } = req.body;
    if (!name) return res.status(400).json({ error: 'フィールド名は必須です' });

    const id = sheets.generateId();
    await sheets.appendRow('カスタムフィールド', {
      'ID': id,
      'フィールド名': name,
      'フィールド種類': type || 'select',
      '表示順': order || '99',
      '有効': 'true',
    });

    // 会員名簿シートに列を追加
    await sheets.addColumnToSheet('会員名簿', name);

    res.json({ success: true, id });
  } catch (err) {
    console.error('Add custom field error:', err);
    res.status(500).json({ error: 'カスタムフィールドの追加に失敗しました' });
  }
});

router.put('/custom-fields/:id', ownerOnly, async (req, res) => {
  try {
    const { data } = await sheets.getSheetData('カスタムフィールド');
    const field = data.find(d => d['ID'] === req.params.id);
    if (!field) return res.status(404).json({ error: 'フィールドが見つかりません' });

    if (req.body.name !== undefined) await sheets.updateCell('カスタムフィールド', field._rowIndex, 'フィールド名', req.body.name);
    if (req.body.order !== undefined) await sheets.updateCell('カスタムフィールド', field._rowIndex, '表示順', req.body.order);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'カスタムフィールドの更新に失敗しました' });
  }
});

router.delete('/custom-fields/:id', ownerOnly, async (req, res) => {
  try {
    const { data } = await sheets.getSheetData('カスタムフィールド');
    const field = data.find(d => d['ID'] === req.params.id);
    if (!field) return res.status(404).json({ error: 'フィールドが見つかりません' });

    // 無効化（列を消すとデータが壊れるため削除ではなく無効化）
    await sheets.updateCell('カスタムフィールド', field._rowIndex, '有効', 'false');

    // 関連する選択肢も削除
    const { data: options } = await sheets.getSheetData('カスタムフィールド選択肢');
    const related = options
      .filter(o => o['フィールドID'] === req.params.id)
      .sort((a, b) => b._rowIndex - a._rowIndex);
    for (const opt of related) {
      await sheets.deleteRow('カスタムフィールド選択肢', opt._rowIndex);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'カスタムフィールドの削除に失敗しました' });
  }
});

// カスタムフィールド選択肢 CRUD

router.post('/custom-fields/:fieldId/options', ownerOnly, async (req, res) => {
  try {
    const { name, order } = req.body;
    if (!name) return res.status(400).json({ error: '選択肢名は必須です' });
    await sheets.appendRow('カスタムフィールド選択肢', {
      'フィールドID': req.params.fieldId,
      '選択肢名': name,
      '表示順': order || '99',
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '選択肢の追加に失敗しました' });
  }
});

router.delete('/custom-fields/:fieldId/options/:rowIndex', ownerOnly, async (req, res) => {
  try {
    await sheets.deleteRow('カスタムフィールド選択肢', parseInt(req.params.rowIndex));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '選択肢の削除に失敗しました' });
  }
});

// ============ イベント種類 ============

router.get('/event-types', async (req, res) => {
  try {
    const { data } = await sheets.getSheetData('イベント種類');
    const types = data
      .sort((a, b) => (parseInt(a['表示順']) || 99) - (parseInt(b['表示順']) || 99))
      .map(t => ({ name: t['種類名'], order: t['表示順'], _rowIndex: t._rowIndex }));
    res.json({ types });
  } catch (err) {
    res.status(500).json({ error: 'イベント種類の取得に失敗しました' });
  }
});

router.post('/event-types', ownerOnly, async (req, res) => {
  try {
    const { name, order } = req.body;
    if (!name) return res.status(400).json({ error: '種類名は必須です' });
    await sheets.appendRow('イベント種類', { '種類名': name, '表示順': order || '99' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'イベント種類の追加に失敗しました' });
  }
});

router.delete('/event-types/:rowIndex', ownerOnly, async (req, res) => {
  try {
    await sheets.deleteRow('イベント種類', parseInt(req.params.rowIndex));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'イベント種類の削除に失敗しました' });
  }
});

// ============ 一般設定 ============

router.get('/general', async (req, res) => {
  try {
    const unitName = await sheets.getSetting('単会名');
    res.json({ unitName, spreadsheetId: process.env.SPREADSHEET_ID });
  } catch (err) {
    res.status(500).json({ error: '設定の取得に失敗しました' });
  }
});

router.put('/general', ownerOnly, async (req, res) => {
  try {
    if (req.body.unitName) await sheets.setSetting('単会名', req.body.unitName);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '設定の更新に失敗しました' });
  }
});

module.exports = router;
