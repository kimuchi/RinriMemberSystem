const express = require('express');
const sheets = require('../services/sheets');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { data: members } = await sheets.getSheetData('会員名簿');
    const { data: events } = await sheets.getSheetData('イベント');
    const { data: attendance } = await sheets.getSheetData('イベント出席');

    // ダッシュボードカードの設定を読み込み、各カードのカウントを算出
    const cardConfigs = await sheets.getDashboardCards();
    const cards = cardConfigs.map(c => {
      let count = 0;
      if (c.statuses.includes('*')) {
        count = members.length;
      } else if (c.statuses.length > 0) {
        const set = new Set(c.statuses);
        count = members.filter(m => set.has(m['入会ステータス'])).length;
      }
      return {
        id: c.id,
        label: c.label,
        icon: c.icon,
        color: c.color,
        count,
      };
    });

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
      cards,
      counts: { total: members.length },
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
