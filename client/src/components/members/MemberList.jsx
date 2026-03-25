import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { useApp } from '../../App';
import Icon from '../Icon';
import './Members.css';

export default function MemberList() {
  const { toast } = useApp();
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [extraFields, setExtraFields] = useState([]);
  const [eventList, setEventList] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [cfOptionsMap, setCfOptionsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cfFilters, setCfFilters] = useState({});
  const [sortKey, setSortKey] = useState('furigana');
  const [sortDir, setSortDir] = useState('asc');

  // イベント参加履歴の表示設定
  const [showEventHistory, setShowEventHistory] = useState(false);
  const [eventStatusFilter, setEventStatusFilter] = useState('');
  const [eventPeriodMonths, setEventPeriodMonths] = useState(12);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [memberRes, statusRes, cfRes] = await Promise.all([
        api.getMembers(),
        api.getStatuses(),
        api.getCustomFields(),
      ]);
      setMembers(memberRes.members);
      setCustomFields(memberRes.customFields || []);
      setExtraFields(memberRes.extraFields || []);
      setEventList(memberRes.eventList || []);
      setStatuses(statusRes.statuses.map(s => s.name));
      const optMap = {};
      (cfRes.fields || []).forEach(f => {
        optMap[f.id] = f.options ? f.options.map(o => o.name) : [];
      });
      setCfOptionsMap(optMap);
    } catch (err) {
      toast.error('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  async function handleInlineStatus(memberId, field, value) {
    try {
      await api.updateMemberStatus(memberId, field, value);
      setMembers(prev => prev.map(m =>
        m.id === memberId
          ? field === '入会ステータス'
            ? { ...m, memberStatus: value }
            : { ...m, customFields: { ...m.customFields, [customFields.find(cf => cf.name === field)?.id]: value } }
          : m
      ));
    } catch (err) {
      toast.error('ステータスの更新に失敗しました');
    }
  }

  function handleCfFilter(cfId, value) {
    setCfFilters(prev => ({ ...prev, [cfId]: value }));
  }

  // 期間内のイベント一覧を計算
  const periodEvents = useMemo(() => {
    if (!showEventHistory) return [];
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - eventPeriodMonths);
    const cutoffStr = cutoff.toISOString();
    return eventList.filter(ev => {
      if (!ev.date) return false;
      return ev.date >= cutoffStr;
    });
  }, [eventList, showEventHistory, eventPeriodMonths]);

  const filtered = useMemo(() => {
    let result = [...members];
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(m =>
        (m.name || '').toLowerCase().includes(s) ||
        (m.furigana || '').toLowerCase().includes(s) ||
        (m.company || '').toLowerCase().includes(s) ||
        (m.email || '').toLowerCase().includes(s)
      );
    }
    if (statusFilter) {
      result = result.filter(m => m.memberStatus === statusFilter);
    }
    // カスタムフィールドの絞り込み
    for (const [cfId, val] of Object.entries(cfFilters)) {
      if (val) {
        result = result.filter(m => m.customFields[cfId] === val);
      }
    }
    // イベント参加で絞り込み
    if (showEventHistory && eventStatusFilter) {
      result = result.filter(m => {
        const evts = m.allEvents || [];
        return evts.some(e => {
          const inPeriod = periodEvents.some(pe => pe.id === e.eventId);
          return inPeriod && e.status === eventStatusFilter;
        });
      });
    }
    result.sort((a, b) => {
      let va = a[sortKey] || '';
      let vb = b[sortKey] || '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [members, search, statusFilter, cfFilters, sortKey, sortDir, showEventHistory, eventStatusFilter, periodEvents]);

  // 会員ごとの期間内参加回数を計算
  function getAttendanceCount(member) {
    const evts = member.allEvents || [];
    return evts.filter(e =>
      e.status === '出席' && periodEvents.some(pe => pe.id === e.eventId)
    ).length;
  }

  // 会員の特定イベントでの出席状態を取得
  function getEventStatus(member, eventId) {
    const evts = member.allEvents || [];
    const found = evts.find(e => e.eventId === eventId);
    return found ? found.status : '';
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <Icon name="unfold_more" size={14} className="sort-icon" />;
    return <Icon name={sortDir === 'asc' ? 'expand_less' : 'expand_more'} size={14} className="sort-icon active" />;
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>;
  }

  const totalCols = 3 + customFields.length + extraFields.length + 1 + (showEventHistory ? periodEvents.length + 1 : 0);

  return (
    <div className="member-page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
        <div>
          <h1 className="page-title">会員名簿</h1>
          <p className="page-subtitle">{filtered.length}件表示 / {members.length}件中</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/members/new')}>
          <Icon name="person_add" size={18} />
          新規追加
        </button>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="filter-search">
          <Icon name="search" size={18} />
          <input
            type="text"
            placeholder="氏名・会社名・メールで検索..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="form-select"
          style={{ maxWidth: 200 }}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">すべてのステータス</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {customFields.map(cf => (
          <select
            key={cf.id}
            className="form-select"
            style={{ maxWidth: 200 }}
            value={cfFilters[cf.id] || ''}
            onChange={e => handleCfFilter(cf.id, e.target.value)}
          >
            <option value="">すべての{cf.name}</option>
            {(cfOptionsMap[cf.id] || []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
      </div>

      {/* イベント参加履歴の表示設定 */}
      <div className="event-history-controls">
        <button
          className={`btn btn-sm ${showEventHistory ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setShowEventHistory(!showEventHistory)}
        >
          <Icon name="event" size={16} />
          {showEventHistory ? 'イベント履歴を隠す' : 'イベント参加履歴を表示'}
        </button>
        {showEventHistory && (
          <>
            <select
              className="form-select"
              style={{ maxWidth: 140 }}
              value={eventPeriodMonths}
              onChange={e => setEventPeriodMonths(Number(e.target.value))}
            >
              <option value={3}>過去3ヶ月</option>
              <option value={6}>過去6ヶ月</option>
              <option value={12}>過去12ヶ月</option>
              <option value={24}>過去24ヶ月</option>
              <option value={9999}>全期間</option>
            </select>
            <select
              className="form-select"
              style={{ maxWidth: 160 }}
              value={eventStatusFilter}
              onChange={e => setEventStatusFilter(e.target.value)}
            >
              <option value="">すべての出席状態</option>
              <option value="出席">出席のみ</option>
              <option value="事前登録">事前登録のみ</option>
              <option value="欠席">欠席のみ</option>
            </select>
          </>
        )}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('furigana')} className="th-name">氏名 <SortIcon col="furigana" /></th>
              <th onClick={() => handleSort('company')}>会社名 <SortIcon col="company" /></th>
              <th onClick={() => handleSort('memberStatus')}>
                入会ステータス <SortIcon col="memberStatus" />
              </th>
              {customFields.map(cf => (
                <th key={cf.id} className="hide-mobile th-wrap">{cf.name}</th>
              ))}
              {extraFields.map(col => (
                <th key={col} className="hide-mobile th-wrap">{col}</th>
              ))}
              <th className="hide-mobile th-wrap">直近イベント</th>
              {showEventHistory && (
                <>
                  <th className="hide-mobile th-event-count">参加回数</th>
                  {periodEvents.map(ev => (
                    <th key={ev.id} className="hide-mobile th-event-col" title={`${ev.name} (${ev.date || '日時未定'})`}>
                      {ev.name}
                    </th>
                  ))}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={totalCols} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                  {search || statusFilter || Object.values(cfFilters).some(v => v) ? '条件に一致する会員がいません' : 'まだ会員が登録されていません'}
                </td>
              </tr>
            ) : (
              filtered.map(m => (
                <tr key={m.id}>
                  <td onClick={() => navigate(`/members/${m.id}`)} style={{ cursor: 'pointer' }}>
                    <div style={{ fontWeight: 500 }}>{m.name || '（氏名未入力）'}</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{m.furigana}</div>
                  </td>
                  <td onClick={() => navigate(`/members/${m.id}`)}>{m.company}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <select
                      className="inline-select"
                      value={m.memberStatus}
                      onChange={e => handleInlineStatus(m.id, '入会ステータス', e.target.value)}
                      style={statusStyle(m.memberStatus)}
                    >
                      <option value="">--</option>
                      {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  {customFields.map(cf => (
                    <td key={cf.id} className="hide-mobile" onClick={e => e.stopPropagation()}>
                      <select
                        className="inline-select"
                        value={m.customFields[cf.id] || ''}
                        onChange={e => handleInlineStatus(m.id, cf.name, e.target.value)}
                      >
                        <option value="">--</option>
                        {(cfOptionsMap[cf.id] || []).map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                  ))}
                  {extraFields.map(col => (
                    <td key={col} className="hide-mobile" onClick={() => navigate(`/members/${m.id}`)}>
                      {m.extraFields[col] || ''}
                    </td>
                  ))}
                  <td className="hide-mobile td-recent-events" onClick={() => navigate(`/members/${m.id}`)} style={{ fontSize: 'var(--font-size-xs)' }}>
                    {(m.recentEvents || []).length > 0 ? (
                      m.recentEvents.map((ev, i) => (
                        <div key={i} style={{ marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span className={`status-dot ${ev.status === '出席' ? 'dot-success' : ev.status === '事前登録' ? 'dot-info' : 'dot-muted'}`} />
                          {ev.eventName}
                        </div>
                      ))
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)' }}>-</span>
                    )}
                  </td>
                  {showEventHistory && (
                    <>
                      <td className="hide-mobile td-event-count">
                        <span className="attendance-count">{getAttendanceCount(m)}</span>
                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>/ {periodEvents.length}</span>
                      </td>
                      {periodEvents.map(ev => {
                        const st = getEventStatus(m, ev.id);
                        return (
                          <td key={ev.id} className="hide-mobile td-event-cell" title={`${ev.name}: ${st || '未登録'}`}>
                            {st === '出席' ? <span className="ev-mark ev-attended">○</span>
                              : st === '事前登録' ? <span className="ev-mark ev-pre">△</span>
                              : st === '欠席' ? <span className="ev-mark ev-absent">×</span>
                              : st === '遅刻' ? <span className="ev-mark ev-late">遅</span>
                              : <span className="ev-mark ev-none">-</span>}
                          </td>
                        );
                      })}
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusStyle(status) {
  if (!status) return {};
  if (status.includes('登録済')) return { color: 'var(--color-success)', background: 'var(--color-success-bg)' };
  if (status === '申込書受領中') return { color: 'var(--color-info)', background: 'var(--color-info-bg)' };
  if (status === '検討中') return { color: 'var(--color-warning)', background: 'var(--color-warning-bg)' };
  return {};
}
