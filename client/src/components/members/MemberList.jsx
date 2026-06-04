import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { useApp } from '../../App';
import Icon from '../Icon';
import CSVImport from './CSVImport';
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
  const [efFilters, setEfFilters] = useState({});
  const [sortKey, setSortKey] = useState('furigana');
  const [sortDir, setSortDir] = useState('asc');

  // CSVインポート
  const [showCsvImport, setShowCsvImport] = useState(false);

  // Excelエクスポート
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFields, setExportFields] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [selectedCols, setSelectedCols] = useState(new Set());
  const [selectedEvents, setSelectedEvents] = useState(new Set());
  const [eventSearch, setEventSearch] = useState('');
  const [exporting, setExporting] = useState(false);

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

  // ---- エクスポート ----
  async function openExportModal() {
    setShowExportModal(true);
    if (exportFields) return;
    setExportLoading(true);
    try {
      const res = await api.getMemberExportFields();
      setExportFields(res);
      // デフォルトで基本情報の主要列をチェック
      const defaultKeys = new Set([
        'member:氏名', 'member:ふりがな', 'member:会社名',
        'member:メールアドレス', 'member:入会ステータス',
      ]);
      const initial = new Set();
      [...res.basic, ...res.custom, ...res.extra].forEach(c => {
        if (defaultKeys.has(c.key)) initial.add(c.key);
      });
      setSelectedCols(initial);
      setSelectedEvents(new Set());
    } catch (err) {
      toast.error(err.message);
      setShowExportModal(false);
    } finally {
      setExportLoading(false);
    }
  }

  function toggleExportCol(key) {
    setSelectedCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleExportGroup(cols) {
    const keys = cols.map(c => c.key);
    const allChecked = keys.length > 0 && keys.every(k => selectedCols.has(k));
    setSelectedCols(prev => {
      const next = new Set(prev);
      keys.forEach(k => allChecked ? next.delete(k) : next.add(k));
      return next;
    });
  }

  function toggleEvent(eventId) {
    setSelectedEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  function toggleEventsAll(events) {
    const ids = events.map(e => e.key.slice('event:'.length));
    const allChecked = ids.length > 0 && ids.every(id => selectedEvents.has(id));
    setSelectedEvents(prev => {
      const next = new Set(prev);
      ids.forEach(id => allChecked ? next.delete(id) : next.add(id));
      return next;
    });
  }

  async function handleExport() {
    if (!exportFields) return;
    if (selectedCols.size === 0 && selectedEvents.size === 0) {
      toast.warning('1列以上選択してください');
      return;
    }
    // 表示順を保ってカラム配列を構築
    const memberCols = [...exportFields.basic, ...exportFields.custom, ...exportFields.extra]
      .filter(c => selectedCols.has(c.key));
    const eventCols = exportFields.events
      .filter(e => selectedEvents.has(e.key.slice('event:'.length)))
      .map(e => ({
        key: e.key,
        // 日付付きで分かりやすく
        label: e.date ? `${e.label}（${e.date.slice(0, 10)}）` : e.label,
      }));
    const columns = [...memberCols, ...eventCols];

    setExporting(true);
    try {
      // 絞り込み済みの会員IDを順序付きで送信
      const ids = filtered.map(m => m.id);
      await api.exportMembers(ids, columns);
      toast.success(`${ids.length}件をエクスポートしました`);
      setShowExportModal(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
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

  // 追加列のユニーク値を計算（フィルター用ドロップダウン）
  const extraFieldOptions = useMemo(() => {
    const map = {};
    extraFields.forEach(col => {
      const vals = new Set();
      members.forEach(m => {
        const v = (m.extraFields || {})[col];
        if (v) vals.add(v);
      });
      map[col] = [...vals].sort((a, b) => a.localeCompare(b, 'ja'));
    });
    return map;
  }, [members, extraFields]);

  // ソート値を取得するヘルパー
  function getSortValue(m, key) {
    if (key.startsWith('cf:')) return (m.customFields || {})[key.slice(3)] || '';
    if (key.startsWith('ef:')) return (m.extraFields || {})[key.slice(3)] || '';
    return m[key] || '';
  }

  const filtered = useMemo(() => {
    let result = [...members];
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(m => {
        if ((m.name || '').toLowerCase().includes(s)) return true;
        if ((m.furigana || '').toLowerCase().includes(s)) return true;
        if ((m.company || '').toLowerCase().includes(s)) return true;
        if ((m.email || '').toLowerCase().includes(s)) return true;
        if ((m.corporateNumber || '').toLowerCase().includes(s)) return true;
        // 追加列も検索対象
        const ef = m.extraFields || {};
        for (const col of extraFields) {
          if ((ef[col] || '').toLowerCase().includes(s)) return true;
        }
        return false;
      });
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
    // 追加列の絞り込み
    for (const [col, val] of Object.entries(efFilters)) {
      if (val) {
        result = result.filter(m => (m.extraFields || {})[col] === val);
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
      let va = getSortValue(a, sortKey);
      let vb = getSortValue(b, sortKey);
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [members, search, statusFilter, cfFilters, efFilters, sortKey, sortDir, showEventHistory, eventStatusFilter, periodEvents, extraFields]);

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
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={openExportModal}>
            <Icon name="download" size={18} />
            Excelエクスポート
          </button>
          <button className="btn btn-secondary" onClick={() => setShowCsvImport(true)}>
            <Icon name="upload_file" size={18} />
            CSVインポート
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/members/new')}>
            <Icon name="person_add" size={18} />
            新規追加
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="filter-search">
          <Icon name="search" size={18} />
          <input
            type="text"
            placeholder="氏名・会社名・メール・会員番号で検索..."
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
        {extraFields.map(col => {
          const opts = extraFieldOptions[col] || [];
          if (opts.length === 0 || opts.length > 50) return null;
          return (
            <select
              key={col}
              className="form-select"
              style={{ maxWidth: 200 }}
              value={efFilters[col] || ''}
              onChange={e => setEfFilters(prev => ({ ...prev, [col]: e.target.value }))}
            >
              <option value="">すべての{col}</option>
              {opts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          );
        })}
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
                <th key={cf.id} className="hide-mobile th-wrap" onClick={() => handleSort(`cf:${cf.id}`)} style={{ cursor: 'pointer' }}>
                  {cf.name} <SortIcon col={`cf:${cf.id}`} />
                </th>
              ))}
              {extraFields.map(col => (
                <th key={col} className="hide-mobile th-wrap" onClick={() => handleSort(`ef:${col}`)} style={{ cursor: 'pointer' }}>
                  {col} <SortIcon col={`ef:${col}`} />
                </th>
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
                  {search || statusFilter || Object.values(cfFilters).some(v => v) || Object.values(efFilters).some(v => v) ? '条件に一致する会員がいません' : 'まだ会員が登録されていません'}
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

      {showCsvImport && (
        <CSVImport
          onClose={() => setShowCsvImport(false)}
          onImported={() => { setShowCsvImport(false); setLoading(true); loadData(); }}
        />
      )}

      {showExportModal && (
        <div className="modal-overlay" onClick={() => !exporting && setShowExportModal(false)}>
          <div className="modal-content bulk-modal" onClick={e => e.stopPropagation()} style={{ width: 640, maxWidth: '95vw' }}>
            <div className="modal-header">
              <h2>Excelエクスポート</h2>
              <button className="btn-icon" onClick={() => setShowExportModal(false)} disabled={exporting}>
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto' }}>
              {exportLoading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-lg)' }}><div className="spinner" /></div>
              ) : !exportFields ? (
                <p style={{ color: 'var(--color-text-muted)' }}>列情報を取得できませんでした</p>
              ) : (
                <>
                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)' }}>
                    現在の絞り込み結果 <strong>{filtered.length}件</strong> を、選択した列でエクスポートします。
                  </p>

                  {/* 会員列の選択 */}
                  <ExportGroup title="基本情報" cols={exportFields.basic} selectedCols={selectedCols} toggleCol={toggleExportCol} toggleGroup={toggleExportGroup} />
                  <ExportGroup title="カスタムフィールド" cols={exportFields.custom} selectedCols={selectedCols} toggleCol={toggleExportCol} toggleGroup={toggleExportGroup} />
                  <ExportGroup title="追加列" cols={exportFields.extra} selectedCols={selectedCols} toggleCol={toggleExportCol} toggleGroup={toggleExportGroup} />

                  {/* イベント列の選択 */}
                  {exportFields.events.length > 0 && (
                    <div style={{ marginTop: 'var(--space-md)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-xs)' }}>
                        <strong>参加イベント（出席列に「○」を出力）</strong>
                        <input
                          className="form-input"
                          placeholder="イベント名で検索..."
                          value={eventSearch}
                          onChange={e => setEventSearch(e.target.value)}
                          style={{ maxWidth: 200, fontSize: 'var(--font-size-sm)', padding: '4px 8px' }}
                        />
                      </div>
                      <EventExportList
                        events={exportFields.events.filter(e =>
                          !eventSearch || (e.label || '').toLowerCase().includes(eventSearch.toLowerCase())
                        )}
                        selectedEvents={selectedEvents}
                        toggleEvent={toggleEvent}
                        toggleEventsAll={toggleEventsAll}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer">
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                列{selectedCols.size}件 + イベント{selectedEvents.size}件 選択中
              </span>
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <button className="btn btn-secondary" onClick={() => setShowExportModal(false)} disabled={exporting}>
                  キャンセル
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleExport}
                  disabled={exporting || exportLoading || (selectedCols.size === 0 && selectedEvents.size === 0)}
                >
                  {exporting ? '出力中...' : 'エクスポート'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExportGroup({ title, cols, selectedCols, toggleCol, toggleGroup }) {
  if (!cols || cols.length === 0) return null;
  const allChecked = cols.every(c => selectedCols.has(c.key));
  return (
    <div style={{ marginBottom: 'var(--space-sm)' }}>
      <label className="bulk-check-item" style={{ fontWeight: 600, background: 'var(--color-bg-secondary)' }}>
        <input type="checkbox" checked={allChecked} onChange={() => toggleGroup(cols)} />
        <span>{title}</span>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          {cols.filter(c => selectedCols.has(c.key)).length} / {cols.length}
        </span>
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {cols.map(c => (
          <label key={c.key} className="bulk-check-item" style={{ paddingLeft: 'var(--space-lg)' }}>
            <input type="checkbox" checked={selectedCols.has(c.key)} onChange={() => toggleCol(c.key)} />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function EventExportList({ events, selectedEvents, toggleEvent, toggleEventsAll }) {
  if (events.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', padding: 'var(--space-sm)' }}>該当するイベントがありません</p>;
  }
  const ids = events.map(e => e.key.slice('event:'.length));
  const allChecked = ids.every(id => selectedEvents.has(id));
  return (
    <div style={{ border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-sm)', maxHeight: 320, overflowY: 'auto' }}>
      <label className="bulk-check-item" style={{ fontWeight: 600, background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border-light)' }}>
        <input type="checkbox" checked={allChecked} onChange={() => toggleEventsAll(events)} />
        <span>全て選択（{events.length}件）</span>
      </label>
      {events.map(e => {
        const id = e.key.slice('event:'.length);
        return (
          <label key={id} className="bulk-check-item">
            <input type="checkbox" checked={selectedEvents.has(id)} onChange={() => toggleEvent(id)} />
            <span style={{ flex: 1 }}>{e.label || '(名称なし)'}</span>
            {e.type && <span className="badge badge-primary" style={{ fontSize: 'var(--font-size-xs)' }}>{e.type}</span>}
            {e.date && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{e.date.slice(0, 10)}</span>}
          </label>
        );
      })}
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
