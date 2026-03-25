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
  const [statuses, setStatuses] = useState([]);
  const [cfOptionsMap, setCfOptionsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortKey, setSortKey] = useState('furigana');
  const [sortDir, setSortDir] = useState('asc');
  const [showAddModal, setShowAddModal] = useState(false);

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
      setStatuses(statusRes.statuses.map(s => s.name));
      // Build options map for custom fields
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
  }, [members, search, statusFilter, sortKey, sortDir]);

  function SortIcon({ col }) {
    if (sortKey !== col) return <Icon name="unfold_more" size={14} className="sort-icon" />;
    return <Icon name={sortDir === 'asc' ? 'expand_less' : 'expand_more'} size={14} className="sort-icon active" />;
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>;
  }

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
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('furigana')}>氏名 <SortIcon col="furigana" /></th>
              <th onClick={() => handleSort('company')}>会社名 <SortIcon col="company" /></th>
              <th className="hide-mobile">メール</th>
              <th className="hide-mobile">携帯</th>
              <th onClick={() => handleSort('memberStatus')}>
                入会ステータス <SortIcon col="memberStatus" />
              </th>
              {customFields.map(cf => (
                <th key={cf.id} className="hide-mobile">{cf.name}</th>
              ))}
              {extraFields.map(col => (
                <th key={col} className="hide-mobile">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5 + customFields.length + extraFields.length} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
                  {search || statusFilter ? '条件に一致する会員がいません' : 'まだ会員が登録されていません'}
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
                  <td className="hide-mobile" onClick={() => navigate(`/members/${m.id}`)}>{m.email}</td>
                  <td className="hide-mobile" onClick={() => navigate(`/members/${m.id}`)}>{m.phone}</td>
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
