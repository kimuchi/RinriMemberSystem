const express = require('express');
const sheets = require('../services/sheets');
const formImportRouter = require('./form-import');
const router = express.Router();

// フォーム連携サブルーター
router.use('/:id/form', formImportRouter);

/**
 * GET /api/events - イベント一覧
 */
router.get('/', async (req, res) => {
  try {
    const { data: events } = await sheets.getSheetData('イベント');
    const { data: attendance } = await sheets.getSheetData('イベント出席');

    const result = events.map(e => {
      const att = attendance.filter(a => a['イベントID'] === e['ID']);
      return {
        id: e['ID'],
        name: e['イベント名'],
        type: e['種類'],
        date: e['日時'],
        location: e['場所'],
        description: e['説明'],
        attendeeCount: att.filter(a => a['出席状態'] === '出席').length,
        totalInvited: att.length,
        _rowIndex: e._rowIndex,
      };
    });

    res.json({ events: result });
  } catch (err) {
    console.error('Get events error:', err);
    res.status(500).json({ error: 'イベント一覧の取得に失敗しました' });
  }
});

/**
 * GET /api/events/types - イベント種類一覧
 */
router.get('/types', async (req, res) => {
  try {
    const { data } = await sheets.getSheetData('イベント種類');
    const types = data
      .sort((a, b) => (parseInt(a['表示順']) || 99) - (parseInt(b['表示順']) || 99))
      .map(d => d['種類名']);
    res.json({ types });
  } catch (err) {
    res.status(500).json({ error: 'イベント種類の取得に失敗しました' });
  }
});

/**
 * GET /api/events/:id - イベント詳細（出席者含む）
 */
router.get('/:id', async (req, res) => {
  try {
    const { data: events } = await sheets.getSheetData('イベント');
    const event = events.find(e => e['ID'] === req.params.id);
    if (!event) return res.status(404).json({ error: 'イベントが見つかりません' });

    const { data: attendance } = await sheets.getSheetData('イベント出席');
    const { data: members } = await sheets.getSheetData('会員名簿');

    // ふりがなマップを作成
    const furiganaMap = {};
    members.forEach(m => { furiganaMap[m['ID']] = m['ふりがな'] || ''; });

    const eventAttendance = attendance
      .filter(a => a['イベントID'] === req.params.id)
      .map(a => ({
        id: a['ID'],
        memberId: a['会員ID'],
        memberName: a['氏名'],
        memberFurigana: furiganaMap[a['会員ID']] || '',
        status: a['出席状態'],
        notes: a['備考'],
        _rowIndex: a._rowIndex,
      }))
      .sort((a, b) => (a.memberFurigana || '').localeCompare(b.memberFurigana || '', 'ja'));

    // 未登録の会員一覧も返す（五十音順）
    const attendedMemberIds = new Set(eventAttendance.map(a => a.memberId));
    const unregistered = members
      .filter(m => !attendedMemberIds.has(m['ID']))
      .map(m => ({ id: m['ID'], name: m['氏名'], furigana: m['ふりがな'] || '' }))
      .sort((a, b) => (a.furigana || '').localeCompare(b.furigana || '', 'ja'));

    res.json({
      event: {
        id: event['ID'],
        name: event['イベント名'],
        type: event['種類'],
        date: event['日時'],
        location: event['場所'],
        description: event['説明'],
      },
      attendance: eventAttendance,
      unregisteredMembers: unregistered,
    });
  } catch (err) {
    console.error('Get event error:', err);
    res.status(500).json({ error: 'イベント情報の取得に失敗しました' });
  }
});

/**
 * POST /api/events - イベント追加
 */
router.post('/', async (req, res) => {
  try {
    const id = sheets.generateId();
    await sheets.appendRow('イベント', {
      'ID': id,
      'イベント名': req.body.name || '',
      '種類': req.body.type || '',
      '日時': req.body.date || '',
      '場所': req.body.location || '',
      '説明': req.body.description || '',
      '登録日': new Date().toISOString(),
    });
    res.json({ success: true, id });
  } catch (err) {
    console.error('Add event error:', err);
    res.status(500).json({ error: 'イベントの追加に失敗しました' });
  }
});

/**
 * PUT /api/events/:id - イベント更新
 */
router.put('/:id', async (req, res) => {
  try {
    const { data } = await sheets.getSheetData('イベント');
    const event = data.find(e => e['ID'] === req.params.id);
    if (!event) return res.status(404).json({ error: 'イベントが見つかりません' });

    const updated = {
      ...event,
      'イベント名': req.body.name ?? event['イベント名'],
      '種類': req.body.type ?? event['種類'],
      '日時': req.body.date ?? event['日時'],
      '場所': req.body.location ?? event['場所'],
      '説明': req.body.description ?? event['説明'],
    };
    await sheets.updateRow('イベント', event._rowIndex, updated);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'イベントの更新に失敗しました' });
  }
});

/**
 * DELETE /api/events/:id - イベント削除
 */
router.delete('/:id', async (req, res) => {
  try {
    const { data } = await sheets.getSheetData('イベント');
    const event = data.find(e => e['ID'] === req.params.id);
    if (!event) return res.status(404).json({ error: 'イベントが見つかりません' });

    // 関連する出席データも削除
    const { data: attendance } = await sheets.getSheetData('イベント出席');
    const related = attendance
      .filter(a => a['イベントID'] === req.params.id)
      .sort((a, b) => b._rowIndex - a._rowIndex); // 下から削除
    for (const att of related) {
      await sheets.deleteRow('イベント出席', att._rowIndex);
    }

    // 出席データ削除後に再取得してからイベント本体を削除
    const { data: freshEvents } = await sheets.getSheetData('イベント');
    const freshEvent = freshEvents.find(e => e['ID'] === req.params.id);
    if (freshEvent) {
      await sheets.deleteRow('イベント', freshEvent._rowIndex);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'イベントの削除に失敗しました' });
  }
});

/**
 * POST /api/events/:id/attendance - 出席登録
 */
router.post('/:id/attendance', async (req, res) => {
  try {
    const { memberId, memberName, status } = req.body;
    const id = sheets.generateId();
    await sheets.appendRow('イベント出席', {
      'ID': id,
      'イベントID': req.params.id,
      '会員ID': memberId,
      '氏名': memberName,
      '出席状態': status || '事前登録',
      '備考': req.body.notes || '',
    });
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: '出席の登録に失敗しました' });
  }
});

/**
 * POST /api/events/:id/attendance/bulk - 一括出席登録
 * body: { members: [{ id, name }], status: '未定' }
 */
router.post('/:id/attendance/bulk', async (req, res) => {
  try {
    const { members, status } = req.body;
    if (!members || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ error: '会員が選択されていません' });
    }
    for (const m of members) {
      const id = sheets.generateId();
      await sheets.appendRow('イベント出席', {
        'ID': id,
        'イベントID': req.params.id,
        '会員ID': m.id,
        '氏名': m.name,
        '出席状態': status || '事前登録',
        '備考': '',
      });
    }
    res.json({ success: true, count: members.length });
  } catch (err) {
    console.error('Bulk attendance error:', err);
    res.status(500).json({ error: '一括登録に失敗しました' });
  }
});

/**
 * PATCH /api/events/:eventId/attendance/:attId - 出席状態更新
 */
router.patch('/:eventId/attendance/:attId', async (req, res) => {
  try {
    const { data } = await sheets.getSheetData('イベント出席');
    const att = data.find(a => a['ID'] === req.params.attId);
    if (!att) return res.status(404).json({ error: '出席データが見つかりません' });

    if (req.body.status) {
      await sheets.updateCell('イベント出席', att._rowIndex, '出席状態', req.body.status);
    }
    if (req.body.notes !== undefined) {
      await sheets.updateCell('イベント出席', att._rowIndex, '備考', req.body.notes);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '出席状態の更新に失敗しました' });
  }
});

/**
 * DELETE /api/events/:eventId/attendance/:attId - 出席削除
 */
router.delete('/:eventId/attendance/:attId', async (req, res) => {
  try {
    const { data } = await sheets.getSheetData('イベント出席');
    const att = data.find(a => a['ID'] === req.params.attId);
    if (!att) return res.status(404).json({ error: '出席データが見つかりません' });

    await sheets.deleteRow('イベント出席', att._rowIndex);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '出席データの削除に失敗しました' });
  }
});

/**
 * GET /api/events/stats/by-type - 種類別参加率
 */
router.get('/stats/by-type', async (req, res) => {
  try {
    const { data: events } = await sheets.getSheetData('イベント');
    const { data: attendance } = await sheets.getSheetData('イベント出席');

    const stats = {};
    events.forEach(e => {
      const type = e['種類'] || 'その他';
      if (!stats[type]) stats[type] = { events: 0, totalInvited: 0, attended: 0 };
      stats[type].events++;
      const ea = attendance.filter(a => a['イベントID'] === e['ID']);
      stats[type].totalInvited += ea.length;
      stats[type].attended += ea.filter(a => a['出席状態'] === '出席').length;
    });

    res.json({
      stats: Object.entries(stats).map(([type, s]) => ({
        type,
        events: s.events,
        totalInvited: s.totalInvited,
        attended: s.attended,
        rate: s.totalInvited > 0 ? Math.round((s.attended / s.totalInvited) * 100) : 0,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: '統計データの取得に失敗しました' });
  }
});

module.exports = router;
