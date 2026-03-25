import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { useApp } from '../../App';
import Icon from '../Icon';
import FormImport from './FormImport';
import './Events.css';

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useApp();

  const [event, setEvent] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [unregistered, setUnregistered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [eventTypes, setEventTypes] = useState([]);

  // 一括登録モーダル
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // 当日出席チェックモード
  const [checkMode, setCheckMode] = useState(false);

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    try {
      const [evRes, typeRes] = await Promise.all([api.getEvent(id), api.getEventTypes()]);
      setEvent(evRes.event);
      setAttendance(evRes.attendance);
      setUnregistered(evRes.unregisteredMembers);
      setEventTypes(typeRes.types);
      setForm({
        name: evRes.event.name,
        type: evRes.event.type,
        date: evRes.event.date,
        location: evRes.event.location,
        description: evRes.event.description,
      });
    } catch (err) {
      toast.error('イベント情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      await api.updateEvent(id, form);
      toast.success('イベントを更新しました');
      setEditing(false);
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDelete() {
    if (!confirm('このイベントと出席データを削除してよろしいですか？')) return;
    try {
      await api.deleteEvent(id);
      toast.success('イベントを削除しました');
      navigate('/events');
    } catch (err) {
      toast.error(err.message);
    }
  }

  // 一括登録
  function openBulkModal() {
    setBulkSelected(new Set());
    setBulkSearch('');
    setShowBulkModal(true);
  }

  function toggleBulkMember(memberId) {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  function toggleBulkAll(filtered) {
    const allSelected = filtered.every(m => bulkSelected.has(m.id));
    if (allSelected) {
      setBulkSelected(prev => {
        const next = new Set(prev);
        filtered.forEach(m => next.delete(m.id));
        return next;
      });
    } else {
      setBulkSelected(prev => {
        const next = new Set(prev);
        filtered.forEach(m => next.add(m.id));
        return next;
      });
    }
  }

  async function handleBulkSubmit() {
    if (bulkSelected.size === 0) return;
    setBulkSubmitting(true);
    try {
      const members = unregistered.filter(m => bulkSelected.has(m.id));
      await api.addAttendanceBulk(id, members, '未定');
      toast.success(`${members.length}名を登録しました`);
      setShowBulkModal(false);
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBulkSubmitting(false);
    }
  }

  // 当日出席チェック
  async function handleCheckToggle(att) {
    const newStatus = att.status === '出席' ? '未定' : '出席';
    try {
      await api.updateAttendance(id, att.id, { status: newStatus });
      setAttendance(prev => prev.map(a => a.id === att.id ? { ...a, status: newStatus } : a));
    } catch (err) {
      toast.error('更新に失敗しました');
    }
  }

  async function handleAttendanceChange(attId, status) {
    try {
      await api.updateAttendance(id, attId, { status });
      setAttendance(prev => prev.map(a => a.id === attId ? { ...a, status } : a));
    } catch (err) {
      toast.error('更新に失敗しました');
    }
  }

  async function handleRemoveAttendee(attId) {
    try {
      await api.deleteAttendance(id, attId);
      loadData();
    } catch (err) {
      toast.error('削除に失敗しました');
    }
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>;
  }

  if (!event) return <div className="empty-state"><p>イベントが見つかりません</p></div>;

  const attended = attendance.filter(a => a.status === '出席').length;
  const filteredUnregistered = unregistered.filter(m =>
    !bulkSearch || m.name.includes(bulkSearch)
  );

  return (
    <div className="event-detail">
      <button className="back-link" onClick={() => navigate('/events')}>
        <Icon name="arrow_back" size={18} /> イベント一覧に戻る
      </button>

      {/* Event Info */}
      <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="card-header">
          <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 600 }}>
            {editing ? 'イベント編集' : event.name}
          </h1>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            {!editing && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                  <Icon name="edit" size={16} /> 編集
                </button>
                <button className="btn btn-danger btn-sm" onClick={handleDelete}>
                  <Icon name="delete" size={16} /> 削除
                </button>
              </>
            )}
          </div>
        </div>
        <div className="card-body">
          {editing ? (
            <>
              <div className="member-form-grid">
                <div className="form-group">
                  <label className="form-label">イベント名</label>
                  <input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">種類</label>
                  <select className="form-select" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                    <option value="">--</option>
                    {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">日時</label>
                  <input className="form-input" type="datetime-local" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">場所</label>
                  <input className="form-input" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} />
                </div>
                <div className="form-group full-width">
                  <label className="form-label">説明</label>
                  <textarea className="form-input" rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
                <button className="btn btn-primary" onClick={handleSave}>保存</button>
                <button className="btn btn-secondary" onClick={() => setEditing(false)}>キャンセル</button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-lg)' }}>
              {event.type && <div><span className="form-label">種類</span><span className="badge badge-primary">{event.type}</span></div>}
              {event.date && <div><span className="form-label">日時</span><div>{event.date}</div></div>}
              {event.location && <div><span className="form-label">場所</span><div>{event.location}</div></div>}
              {event.description && <div style={{ flexBasis: '100%' }}><span className="form-label">説明</span><div>{event.description}</div></div>}
            </div>
          )}
        </div>
      </div>

      {/* Form Import */}
      <FormImport eventId={id} onImported={loadData} />

      {/* Attendance */}
      <div className="card" style={{ marginTop: 'var(--space-lg)' }}>
        <div className="card-header">
          <h2 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600 }}>
            出席管理（{attended}/{attendance.length}名 出席）
          </h2>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            {attendance.length > 0 && (
              <button
                className={`btn btn-sm ${checkMode ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setCheckMode(!checkMode)}
              >
                <Icon name="fact_check" size={16} />
                {checkMode ? '通常モードに戻す' : '当日出席チェック'}
              </button>
            )}
            {unregistered.length > 0 && (
              <button className="btn btn-primary btn-sm" onClick={openBulkModal}>
                <Icon name="group_add" size={16} /> 一括登録
              </button>
            )}
          </div>
        </div>
        <div className="card-body">
          {attendance.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
              出席者がまだ登録されていません。「一括登録」から会員を追加してください。
            </p>
          ) : checkMode ? (
            /* 当日出席チェックモード */
            <div className="check-mode">
              <p className="check-mode-hint">
                <Icon name="info" size={16} /> 名前をタップすると出席/未定を切り替えます
              </p>
              <div className="check-grid">
                {attendance.map(a => (
                  <button
                    key={a.id}
                    className={`check-card ${a.status === '出席' ? 'checked' : ''}`}
                    onClick={() => handleCheckToggle(a)}
                  >
                    <span className="check-icon">
                      {a.status === '出席'
                        ? <Icon name="check_circle" size={28} />
                        : <Icon name="radio_button_unchecked" size={28} />}
                    </span>
                    <span className="check-name">{a.memberName}</span>
                    <span className="check-status">{a.status}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* 通常モード */
            <table className="data-table">
              <thead>
                <tr>
                  <th>氏名</th>
                  <th>出席状態</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {attendance.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{a.memberName}</td>
                    <td>
                      <select
                        className="inline-select"
                        value={a.status}
                        onChange={e => handleAttendanceChange(a.id, e.target.value)}
                        style={a.status === '出席' ? { color: 'var(--color-success)', background: 'var(--color-success-bg)' }
                          : a.status === '欠席' ? { color: 'var(--color-danger)', background: 'var(--color-danger-bg)' }
                          : {}}
                      >
                        <option value="出席">出席</option>
                        <option value="欠席">欠席</option>
                        <option value="遅刻">遅刻</option>
                        <option value="未定">未定</option>
                      </select>
                    </td>
                    <td>
                      <button className="btn-icon" onClick={() => handleRemoveAttendee(a.id)} title="削除">
                        <Icon name="close" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 一括登録モーダル */}
      {showBulkModal && (
        <div className="modal-overlay" onClick={() => setShowBulkModal(false)}>
          <div className="modal bulk-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>出席者を一括登録</h2>
              <button className="btn-icon" onClick={() => setShowBulkModal(false)}>
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="modal-body">
              <input
                className="form-input"
                placeholder="名前で検索..."
                value={bulkSearch}
                onChange={e => setBulkSearch(e.target.value)}
                style={{ marginBottom: 'var(--space-sm)' }}
              />
              <div className="bulk-select-header">
                <label className="bulk-check-item" style={{ fontWeight: 600, borderBottom: '1px solid var(--color-border)' }}>
                  <input
                    type="checkbox"
                    checked={filteredUnregistered.length > 0 && filteredUnregistered.every(m => bulkSelected.has(m.id))}
                    onChange={() => toggleBulkAll(filteredUnregistered)}
                  />
                  <span>全員選択（{filteredUnregistered.length}名）</span>
                </label>
              </div>
              <div className="bulk-list">
                {filteredUnregistered.length === 0 ? (
                  <p style={{ padding: 'var(--space-md)', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                    {unregistered.length === 0 ? '全会員が登録済みです' : '該当する会員がいません'}
                  </p>
                ) : (
                  filteredUnregistered.map(m => (
                    <label key={m.id} className="bulk-check-item">
                      <input
                        type="checkbox"
                        checked={bulkSelected.has(m.id)}
                        onChange={() => toggleBulkMember(m.id)}
                      />
                      <span>{m.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="modal-footer">
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                {bulkSelected.size}名 選択中
              </span>
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <button className="btn btn-secondary" onClick={() => setShowBulkModal(false)}>キャンセル</button>
                <button
                  className="btn btn-primary"
                  onClick={handleBulkSubmit}
                  disabled={bulkSelected.size === 0 || bulkSubmitting}
                >
                  {bulkSubmitting ? '登録中...' : `${bulkSelected.size}名を登録`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
