const express = require('express');
const sheets = require('../services/sheets');
const router = express.Router();

// 「見込み含む」にカウントする入会ステータス
// 会員 + 動き中のプロスペクト（声がけ中・検討中は含まない）
const PROSPECT_STATUSES = [
  '新規登録済',
  '複数口目として登録済',
  '移籍予定',
  '申込書受領済',
  '申込予定',
  'クロージング中',
  '入会保留中',
];

router.get('/', async (req, res) => {
  try {
    const { data: members } = await sheets.getSheetData('会員名簿');
    const { data: events } = await sheets.getSheetData('イベント');
    const { data: attendance } = await sheets.getSheetData('イベント出席');
    const { data: statusOptions } = await sheets.getSheetData('入会ステータス選択肢');

    // 入会ステータスの選択肢名リスト
    const allStatusNames = statusOptions.map(s => s['選択肢名']);

    // 「登録済」を含むステータスを登録済みとみなす
    const registeredStatuses = allStatusNames.filter(s => s.includes('登録済'));
    const registered = members.filter(m =>
      registeredStatuses.includes(m['入会ステータス'])
    ).length;

    // 「見込み含む」は指定ステータスの合計
    const withProspects = members.filter(m =>
      PROSPECT_STATUSES.includes(m['入会ステータス'])
    ).length;

    // 「検討中」の人数
    const contacting = members.filter(m =>
      m['入会ステータス'] === '検討中'
    ).length;

    // ステータス別集計
    const statusBreakdown = {};
    members.forEach(m => {
      const st = m['入会ステータス'] || '未設定';
      statusBreakdown[st] = (statusBreakdown[st] || 0) + 1;
    });

    // 最近のイベント
    const recentEvents = events
      .sort((a, b) => (b['日時'] || '').localeCompare(a['日時'] || ''))
      .slice(0, 5)
      .map(e => {
        const ea = attendance.filter(a => a['イベントID'] === e['ID']);
        return {
          id: e['ID'],
          name: e['イベント名'],
          type: e['種類'],
          date: e['日時'],
          attendees: ea.filter(a => a['出席状態'] === '出席').length,
          total: ea.length,
        };
      });

    // イベント種類別参加率
    const typeStats = {};
    events.forEach(e => {
      const type = e['種類'] || 'その他';
      if (!typeStats[type]) typeStats[type] = { events: 0, total: 0, attended: 0 };
      typeStats[type].events++;
      const ea = attendance.filter(a => a['イベントID'] === e['ID']);
      typeStats[type].total += ea.length;
      typeStats[type].attended += ea.filter(a => a['出席状態'] === '出席').length;
    });

    res.json({
      counts: { registered, withProspects, contacting, total: members.length },
      statusBreakdown,
      recentEvents,
      typeStats: Object.entries(typeStats).map(([type, s]) => ({
        type,
        events: s.events,
        rate: s.total > 0 ? Math.round((s.attended / s.total) * 100) : 0,
      })),
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'ダッシュボードデータの取得に失敗しました' });
  }
});

module.exports = router;
