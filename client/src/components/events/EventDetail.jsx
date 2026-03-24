import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { useApp } from '../../App';
import Icon from '../Icon';
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
  const [addMemberId, setAddMemberId] = useState('');

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

  async function handleAddAttendee() {
    if (!addMemberId) return;
    const member = unregistered.find(m => m.id === addMemberId);
    if (!member) return;
    try {
      await api.addAttendance(id, {
        memberId: member.id,
        memberName: member.name,
        status: '出席',
      });
      toast.success(`${member.name}さんを追加しました`);
      setAddMemberId('');
      loadData();
    } catch (err) {
      toast.error(err.message);
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

      {/* Attendance */}
      <div className="card">
        <div className="card-header">
          <h2 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600 }}>
            出席管理（{attended}/{attendance.length}名 出席）
          </h2>
        </div>
        <div className="card-body">
          {/* Add member */}
          <div className="attendance-controls">
            <select className="form-select" style={{ maxWidth: 300 }} value={addMemberId} onChange={e => setAddMemberId(e.target.value)}>
              <option value="">会員を追加...</option>
              {unregistered.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={handleAddAttendee} disabled={!addMemberId}>
              <Icon name="person_add" size={16} /> 追加
            </button>
          </div>

          {attendance.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>出席者がまだ登録されていません</p>
          ) : (
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
    </div>
  );
}
