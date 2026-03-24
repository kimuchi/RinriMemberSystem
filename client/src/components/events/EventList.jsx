import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { useApp } from '../../App';
import Icon from '../Icon';
import './Events.css';

export default function EventList() {
  const { toast } = useApp();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');

  const [newEvent, setNewEvent] = useState({ name: '', type: '', date: '', location: '', description: '' });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [evRes, typeRes] = await Promise.all([api.getEvents(), api.getEventTypes()]);
      setEvents(evRes.events);
      setEventTypes(typeRes.types);
    } catch (err) {
      toast.error('イベントの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!newEvent.name.trim()) { toast.warning('イベント名は必須です'); return; }
    try {
      const res = await api.addEvent(newEvent);
      toast.success('イベントを追加しました');
      setShowAdd(false);
      setNewEvent({ name: '', type: '', date: '', location: '', description: '' });
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const filtered = typeFilter
    ? events.filter(e => e.type === typeFilter)
    : events;

  const sorted = [...filtered].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>;
  }

  return (
    <div className="events-page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
        <div>
          <h1 className="page-title">イベント管理</h1>
          <p className="page-subtitle">{filtered.length}件のイベント</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Icon name="add_circle" size={18} />
          新規イベント
        </button>
      </div>

      <div className="filter-bar" style={{ marginBottom: 'var(--space-lg)' }}>
        <select
          className="form-select"
          style={{ maxWidth: 200 }}
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="">すべての種類</option>
          {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-state">
          <Icon name="event" />
          <p>まだイベントがありません</p>
        </div>
      ) : (
        <div className="event-grid">
          {sorted.map(e => (
            <div key={e.id} className="event-card card" onClick={() => navigate(`/events/${e.id}`)}>
              <div className="card-body">
                <div className="event-card-header">
                  {e.type && <span className="badge badge-primary">{e.type}</span>}
                  <span className="event-date">{e.date || '日時未定'}</span>
                </div>
                <h3 className="event-name">{e.name}</h3>
                {e.location && (
                  <div className="event-location">
                    <Icon name="place" size={14} />
                    <span>{e.location}</span>
                  </div>
                )}
                <div className="event-attendance-bar">
                  <Icon name="people" size={16} />
                  <span>出席 {e.attendeeCount} / {e.totalInvited}名</span>
                  {e.totalInvited > 0 && (
                    <span className="event-rate">
                      ({Math.round((e.attendeeCount / e.totalInvited) * 100)}%)
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>新規イベント</h2>
              <button className="btn-icon" onClick={() => setShowAdd(false)}><Icon name="close" size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">イベント名 *</label>
                <input className="form-input" value={newEvent.name} onChange={e => setNewEvent(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">種類</label>
                <select className="form-select" value={newEvent.type} onChange={e => setNewEvent(p => ({ ...p, type: e.target.value }))}>
                  <option value="">-- 選択 --</option>
                  {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">日時</label>
                <input className="form-input" type="datetime-local" value={newEvent.date} onChange={e => setNewEvent(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">場所</label>
                <input className="form-input" value={newEvent.location} onChange={e => setNewEvent(p => ({ ...p, location: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">説明</label>
                <textarea className="form-input" rows={2} value={newEvent.description} onChange={e => setNewEvent(p => ({ ...p, description: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>キャンセル</button>
              <button className="btn btn-primary" onClick={handleAdd}>追加する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
