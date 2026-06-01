const express = require('express');
const sheets = require('../services/sheets');
const { buildExcelBuffer, buildStatusColorMap, buildAttendanceListExcel } = require('../utils/excel-export');
const formImportRouter = require('./form-import');
const router = express.Router();

// 会員名簿の基本列（カスタム/追加列の判定に使用）
const MEMBER_BASIC_COLUMNS = new Set([
  '氏名', 'ふりがな', 'メールアドレス', '携帯電話番号',
  '会社名', '住所', '会社電話番号', '入会ステータス', '備考',
]);
// エクスポート対象外のシステム列
const MEMBER_SYSTEM_COLUMNS = new Set(['ID', '登録日', '更新日']);

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

    // 既に登録済みの会員をスキップ（二重登録防止）
    const { data: attendance } = await sheets.getSheetData('イベント出席');
    const alreadyRegistered = new Set(
      attendance.filter(a => a['イベントID'] === req.params.id).map(a => a['会員ID'])
    );
    const newMembers = members.filter(m => !alreadyRegistered.has(m.id));

    if (newMembers.length === 0) {
      return res.json({ success: true, count: 0, skipped: members.length });
    }

    const rows = newMembers.map(m => ({
      'ID': sheets.generateId(),
      'イベントID': req.params.id,
      '会員ID': m.id,
      '氏名': m.name,
      '出席状態': status || '事前登録',
      '備考': '',
    }));
    await sheets.appendRows('イベント出席', rows);
    res.json({ success: true, count: newMembers.length, skipped: members.length - newMembers.length });
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
 * GET /api/events/:id/export-fields - エクスポート可能な列の一覧
 */
router.get('/:id/export-fields', async (req, res) => {
  try {
    const { headers: memberHeaders } = await sheets.getSheetData('会員名簿');
    const customFields = await sheets.getCustomFields();
    const customFieldNames = new Set(customFields.map(cf => cf.name));

    // 会員名簿の列をカテゴリ分け
    const basic = [];
    const custom = [];
    const extra = [];
    for (const h of memberHeaders) {
      if (MEMBER_SYSTEM_COLUMNS.has(h)) continue;
      const col = { key: `member:${h}`, label: h };
      if (customFieldNames.has(h)) custom.push(col);
      else if (MEMBER_BASIC_COLUMNS.has(h)) basic.push(col);
      else extra.push(col);
    }

    // 出席シート由来の列
    const attendance = [
      { key: 'attendance:出席状態', label: '出席状態' },
      { key: 'attendance:備考', label: '出席メモ' },
    ];

    res.json({ attendance, basic, custom, extra });
  } catch (err) {
    console.error('Get export fields error:', err);
    res.status(500).json({ error: 'エクスポート列の取得に失敗しました' });
  }
});

/**
 * POST /api/events/:id/export - 出席者をExcel(xlsx)としてエクスポート
 * body: { columns: [{ key: 'attendance:出席状態' | 'member:<col>', label: 'string' }] }
 */
router.post('/:id/export', async (req, res) => {
  try {
    const { columns } = req.body;
    if (!Array.isArray(columns) || columns.length === 0) {
      return res.status(400).json({ error: '出力する列を選択してください' });
    }

    const { data: events } = await sheets.getSheetData('イベント');
    const event = events.find(e => e['ID'] === req.params.id);
    if (!event) return res.status(404).json({ error: 'イベントが見つかりません' });

    const { data: attendance } = await sheets.getSheetData('イベント出席');
    const { data: members } = await sheets.getSheetData('会員名簿');

    const memberById = {};
    members.forEach(m => { memberById[m['ID']] = m; });

    // 出席者（ふりがな順）
    const rows = attendance
      .filter(a => a['イベントID'] === req.params.id)
      .map(a => ({ att: a, member: memberById[a['会員ID']] || {} }))
      .sort((a, b) => (a.member['ふりがな'] || '').localeCompare(b.member['ふりがな'] || '', 'ja'));

    const dataRows = rows.map(({ att, member }) => columns.map(col => {
      const sep = col.key.indexOf(':');
      if (sep < 0) return '';
      const source = col.key.slice(0, sep);
      const field = col.key.slice(sep + 1);
      if (source === 'attendance') {
        return att[field] || '';
      }
      if (source === 'member') {
        // 氏名は名簿優先、欠落時は出席シートのコピーをフォールバック
        if (field === '氏名') return member['氏名'] || att['氏名'] || '';
        return member[field] || '';
      }
      return '';
    }));

    const columnsWithMeta = columns.map(c => ({
      label: c.label || '',
      key: c.key,
      isStatusColumn: c.key === 'member:入会ステータス',
    }));
    const dashboardCards = await sheets.getDashboardCards();
    const buffer = await buildExcelBuffer({
      sheetName: '出席者一覧',
      columns: columnsWithMeta,
      rows: dataRows,
      statusColorMap: buildStatusColorMap(dashboardCards),
    });

    // ファイル名（イベント名_出席者_YYYYMMDD.xlsx）
    const safeName = (event['イベント名'] || 'event').replace(/[\\/:*?"<>|]/g, '_');
    const dateStr = (event['日時'] || '').slice(0, 10).replace(/-/g, '');
    const filename = `${safeName}_出席者${dateStr ? '_' + dateStr : ''}.xlsx`;
    const encoded = encodeURIComponent(filename);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="export.xlsx"; filename*=UTF-8''${encoded}`
    );
    res.send(buffer);
  } catch (err) {
    console.error('Event export error:', err);
    res.status(500).json({ error: err.message || 'エクスポートに失敗しました' });
  }
});

/**
 * POST /api/events/:id/attendance-list - 当日受付用の出席登録リスト(Excel)
 * body: {
 *   checkItems?: string[],  // チェック列名（例: ['朝礼','MS','朝食会']）
 *   walkInRows?: number,    // ドタ参加用の空欄行数（既定: 10）
 *   includeCompany?: boolean,
 * }
 */
/**
 * GET /api/events/:id/attendance-list-fields
 * 受付名簿の出力候補列を返す（会員列・出席情報列）
 */
router.get('/:id/attendance-list-fields', async (req, res) => {
  try {
    const { headers: memberHeaders } = await sheets.getSheetData('会員名簿');
    const customFields = await sheets.getCustomFields();
    const customNames = new Set(customFields.map(cf => cf.name));
    const systemSet = new Set(['ID', '登録日', '更新日']);
    const basicSet = new Set([
      '氏名', 'ふりがな', 'メールアドレス', '携帯電話番号',
      '会社名', '住所', '会社電話番号', '入会ステータス', '備考',
    ]);

    const basic = [];
    const custom = [];
    const extra = [];
    for (const h of memberHeaders) {
      if (systemSet.has(h)) continue;
      const col = { key: h, label: h };
      if (customNames.has(h)) custom.push(col);
      else if (basicSet.has(h)) basic.push(col);
      else extra.push(col);
    }

    const attendanceInfoColumns = await sheets.getAttendanceExtraColumns();

    res.json({ basic, custom, extra, attendanceInfoColumns });
  } catch (err) {
    console.error('Get attendance-list-fields error:', err);
    res.status(500).json({ error: '出力候補列の取得に失敗しました' });
  }
});

router.post('/:id/attendance-list', async (req, res) => {
  try {
    const {
      memberColumns,
      includeAttendanceStatus,
      infoColumns,
      checkItems,
      walkInRows,
      // 旧パラメータ（後方互換）
      includeCompany,
    } = req.body || {};

    const { data: events } = await sheets.getSheetData('イベント');
    const event = events.find(e => e['ID'] === req.params.id);
    if (!event) return res.status(404).json({ error: 'イベントが見つかりません' });

    const { data: attendance } = await sheets.getSheetData('イベント出席');
    const { data: members } = await sheets.getSheetData('会員名簿');

    const memberById = {};
    members.forEach(m => { memberById[m['ID']] = m; });

    const selectedInfoCols = Array.isArray(infoColumns) ? infoColumns.filter(Boolean) : [];

    // 出力する会員列: 明示指定があればそれを使う。なければデフォルト + 旧 includeCompany
    let memberCols;
    if (Array.isArray(memberColumns) && memberColumns.length > 0) {
      memberCols = memberColumns
        .filter(c => c && typeof c === 'object' && c.key)
        .map(c => ({ key: c.key, label: c.label || c.key }));
    } else {
      memberCols = [{ key: 'ふりがな', label: 'ふりがな' }];
      if (includeCompany !== false) memberCols.push({ key: '会社名', label: '会社名' });
    }

    // 出席者（ふりがな順）
    const attendees = attendance
      .filter(a => a['イベントID'] === req.params.id)
      .map(a => {
        const m = memberById[a['会員ID']] || {};
        const info = {};
        for (const col of selectedInfoCols) {
          info[col] = a[col] || '';
        }
        return {
          member: m,
          fallbackName: a['氏名'],
          attendanceStatus: a['出席状態'] || '',
          info,
        };
      })
      .sort((a, b) => ((a.member['ふりがな'] || '')).localeCompare(b.member['ふりがな'] || '', 'ja'));

    const buffer = await buildAttendanceListExcel({
      event: {
        name: event['イベント名'],
        date: event['日時'],
        location: event['場所'],
        type: event['種類'],
      },
      attendees,
      memberColumns: memberCols,
      includeAttendanceStatus: includeAttendanceStatus !== false,
      infoColumns: selectedInfoCols,
      checkItems: Array.isArray(checkItems) ? checkItems.filter(Boolean) : [],
      walkInRows: typeof walkInRows === 'number' && walkInRows >= 0 ? walkInRows : 10,
    });

    // ファイル名
    const safeName = (event['イベント名'] || 'event').replace(/[\\/:*?"<>|]/g, '_');
    const dateStr = (event['日時'] || '').slice(0, 10).replace(/-/g, '');
    const filename = `出席登録リスト_${safeName}${dateStr ? '_' + dateStr : ''}.xlsx`;
    const encoded = encodeURIComponent(filename);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="attendance-list.xlsx"; filename*=UTF-8''${encoded}`
    );
    res.send(buffer);
  } catch (err) {
    console.error('Attendance list export error:', err);
    res.status(500).json({ error: err.message || '出席登録リストの生成に失敗しました' });
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
