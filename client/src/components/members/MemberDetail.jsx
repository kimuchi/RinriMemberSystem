import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { useApp } from '../../App';
import Icon from '../Icon';
import './Members.css';

export default function MemberDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useApp();
  const isNew = id === 'new';

  const [form, setForm] = useState({
    corporateNumber: '', name: '', furigana: '', email: '', phone: '',
    company: '', address: '', companyPhone: '',
    memberStatus: '', notes: '', customFields: {}, extraFields: {},
  });
  const [statuses, setStatuses] = useState([]);
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [cfOptionsMap, setCfOptionsMap] = useState({});
  const [extraFieldNames, setExtraFieldNames] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [eventHistory, setEventHistory] = useState([]);
  const [showAllEvents, setShowAllEvents] = useState(false);

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    try {
      const [statusRes, cfRes] = await Promise.all([
        api.getStatuses(),
        api.getCustomFields(),
      ]);
      setStatuses(statusRes.statuses.map(s => s.name));
      setCustomFieldDefs(cfRes.fields || []);
      const optMap = {};
      (cfRes.fields || []).forEach(f => {
        optMap[f.id] = f.options ? f.options.map(o => o.name) : [];
      });
      setCfOptionsMap(optMap);

      if (!isNew) {
        const res = await api.getMember(id);
        const m = res.member;
        setExtraFieldNames(res.extraFields || []);
        setEventHistory(res.eventHistory || []);
        setForm({
          corporateNumber: m.corporateNumber || '',
          name: m.name || '',
          furigana: m.furigana || '',
          email: m.email || '',
          phone: m.phone || '',
          company: m.company || '',
          address: m.address || '',
          companyPhone: m.companyPhone || '',
          memberStatus: m.memberStatus || '',
          notes: m.notes || '',
          customFields: m.customFields || {},
          extraFields: m.extraFields || {},
        });
      } else {
        // 新規の場合も追加列名を取得
        const memberRes = await api.getMembers();
        setExtraFieldNames(memberRes.extraFields || []);
      }
    } catch (err) {
      toast.error('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  function handleChange(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function handleCfChange(fieldId, value) {
    setForm(prev => ({
      ...prev,
      customFields: { ...prev.customFields, [fieldId]: value },
    }));
  }

  function handleExtraChange(colName, value) {
    setForm(prev => ({
      ...prev,
      extraFields: { ...prev.extraFields, [colName]: value },
    }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.warning('氏名は必須です');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const res = await api.addMember(form);
        toast.success('会員を追加しました');
        navigate(`/members/${res.id}`);
      } else {
        await api.updateMember(id, form);
        toast.success('会員情報を更新しました');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('この会員を削除してよろしいですか？')) return;
    try {
      await api.deleteMember(id);
      toast.success('会員を削除しました');
      navigate('/members');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleEventStatusChange(eventId, attId, status) {
    try {
      await api.updateAttendance(eventId, attId, { status });
      setEventHistory(prev => prev.map(e =>
        e.attendanceId === attId ? { ...e, status } : e
      ));
    } catch (err) {
      toast.error('更新に失敗しました');
    }
  }

  const VISIBLE_EVENTS = 5;
  const visibleEvents = showAllEvents ? eventHistory : eventHistory.slice(0, VISIBLE_EVENTS);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>;
  }

  return (
    <div className="member-detail">
      <button className="back-link" onClick={() => navigate('/members')}>
        <Icon name="arrow_back" size={18} /> 名簿に戻る
      </button>

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
        <h1 className="page-title">{isNew ? '新規会員追加' : form.name || '会員情報'}</h1>
        {!isNew && (
          <button className="btn btn-danger btn-sm" onClick={handleDelete}>
            <Icon name="delete" size={16} /> 削除
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-body">
          <div className="member-form-grid">
            <div className="form-group">
              <label className="form-label">法人会員番号</label>
              <input
                className="form-input"
                value={form.corporateNumber}
                onChange={e => handleChange('corporateNumber', e.target.value)}
                placeholder="例：007123（先頭の0も保持されます）"
                inputMode="numeric"
              />
            </div>
            <div className="form-group">
              <label className="form-label">氏名 *</label>
              <input className="form-input" value={form.name} onChange={e => handleChange('name', e.target.value)} placeholder="例：山田 太郎" />
            </div>
            <div className="form-group">
              <label className="form-label">ふりがな</label>
              <input className="form-input" value={form.furigana} onChange={e => handleChange('furigana', e.target.value)} placeholder="例：やまだ たろう" />
            </div>
            <div className="form-group">
              <label className="form-label">メールアドレス</label>
              <input className="form-input" type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">携帯電話番号</label>
              <input className="form-input" value={form.phone} onChange={e => handleChange('phone', e.target.value)} placeholder="例：090-1234-5678" />
            </div>
            <div className="form-group">
              <label className="form-label">会社名</label>
              <input className="form-input" value={form.company} onChange={e => handleChange('company', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">会社電話番号</label>
              <input className="form-input" value={form.companyPhone} onChange={e => handleChange('companyPhone', e.target.value)} />
            </div>
            <div className="form-group full-width">
              <label className="form-label">住所</label>
              <input className="form-input" value={form.address} onChange={e => handleChange('address', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">入会ステータス</label>
              <select className="form-select" value={form.memberStatus} onChange={e => handleChange('memberStatus', e.target.value)}>
                <option value="">-- 選択してください --</option>
                {statuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* カスタムフィールド（ドロップダウン） */}
            {customFieldDefs.map(cf => (
              <div className="form-group" key={cf.id}>
                <label className="form-label">{cf.name}</label>
                <select
                  className="form-select"
                  value={form.customFields[cf.id] || ''}
                  onChange={e => handleCfChange(cf.id, e.target.value)}
                >
                  <option value="">-- 選択してください --</option>
                  {(cfOptionsMap[cf.id] || []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}

            {/* 追加列（自由文テキスト） */}
            {extraFieldNames.map(col => (
              <div className="form-group" key={col}>
                <label className="form-label">{col}</label>
                <input
                  className="form-input"
                  value={form.extraFields[col] || ''}
                  onChange={e => handleExtraChange(col, e.target.value)}
                />
              </div>
            ))}

            <div className="form-group full-width">
              <label className="form-label">備考</label>
              <textarea
                className="form-input"
                rows={3}
                value={form.notes}
                onChange={e => handleChange('notes', e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: 'var(--space-lg)' }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              <Icon name={isNew ? 'person_add' : 'save'} size={18} />
              {saving ? '保存中...' : isNew ? '追加する' : '保存する'}
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/members')}>
              キャンセル
            </button>
          </div>
        </div>
      </div>

      {/* イベント参加履歴 */}
      {!isNew && (
        <div className="card" style={{ marginTop: 'var(--space-lg)' }}>
          <div className="card-header">
            <h2 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600 }}>
              <Icon name="event" size={18} /> イベント参加履歴（{eventHistory.length}件）
            </h2>
          </div>
          <div className="card-body">
            {eventHistory.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>参加履歴がありません</p>
            ) : (
              <>
                <ul className="event-history-list">
                  {visibleEvents.map(ev => (
                    <li key={ev.attendanceId} className="event-history-item">
                      <span className={`status-dot ${ev.status === '出席' ? 'dot-success' : ev.status === '事前登録' ? 'dot-info' : ev.status === '欠席' ? 'dot-danger' : 'dot-muted'}`} />
                      <span className="event-history-name" onClick={() => navigate(`/events/${ev.eventId}`)}>
                        {ev.eventName}
                      </span>
                      {ev.eventType && <span className="badge badge-primary event-history-type">{ev.eventType}</span>}
                      <span className="event-history-date">{ev.eventDate || '日時未定'}</span>
                      <select
                        className="inline-select"
                        value={ev.status}
                        onChange={e => handleEventStatusChange(ev.eventId, ev.attendanceId, e.target.value)}
                        style={ev.status === '出席' ? { color: 'var(--color-success)', background: 'var(--color-success-bg)' }
                          : ev.status === '欠席' ? { color: 'var(--color-danger)', background: 'var(--color-danger-bg)' }
                          : ev.status === '事前登録' ? { color: 'var(--color-primary)', background: 'var(--color-primary-bg, #eff6ff)' }
                          : {}}
                      >
                        <option value="事前登録">事前登録</option>
                        <option value="出席">出席</option>
                        <option value="欠席">欠席</option>
                        <option value="遅刻">遅刻</option>
                        <option value="未定">未定</option>
                      </select>
                      {ev.notes && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{ev.notes}</span>}
                    </li>
                  ))}
                </ul>
                {eventHistory.length > VISIBLE_EVENTS && (
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: 'var(--space-sm)' }}
                    onClick={() => setShowAllEvents(!showAllEvents)}
                  >
                    {showAllEvents ? '折りたたむ' : `すべて表示（${eventHistory.length}件）`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
