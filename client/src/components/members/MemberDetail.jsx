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
    name: '', furigana: '', email: '', phone: '',
    company: '', address: '', companyPhone: '',
    memberStatus: '', notes: '', customFields: {},
  });
  const [statuses, setStatuses] = useState([]);
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [cfOptionsMap, setCfOptionsMap] = useState({});
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

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
        setForm({
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
        });
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

            {/* カスタムフィールド */}
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
    </div>
  );
}
