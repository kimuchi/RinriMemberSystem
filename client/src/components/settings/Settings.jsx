import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { useApp } from '../../App';
import Icon from '../Icon';
import './Settings.css';

export default function Settings() {
  const { user, toast, unitName, setUnitName } = useApp();
  const [tab, setTab] = useState('general');

  if (user.role !== 'owner') {
    return (
      <div className="empty-state">
        <Icon name="lock" />
        <p>設定ページはオーナーのみアクセスできます</p>
      </div>
    );
  }

  const tabs = [
    { key: 'general', label: '基本設定', icon: 'tune' },
    { key: 'users', label: 'ユーザー管理', icon: 'manage_accounts' },
    { key: 'statuses', label: '入会ステータス', icon: 'fact_check' },
    { key: 'custom-fields', label: 'カスタムフィールド', icon: 'add_circle_outline' },
    { key: 'event-types', label: 'イベント種類', icon: 'category' },
  ];

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1 className="page-title">設定</h1>
      </div>

      <div className="settings-tabs">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`settings-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <Icon name={t.icon} size={18} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="settings-content">
        {tab === 'general' && <GeneralSettings />}
        {tab === 'users' && <UserSettings />}
        {tab === 'statuses' && <StatusSettings />}
        {tab === 'custom-fields' && <CustomFieldSettings />}
        {tab === 'event-types' && <EventTypeSettings />}
      </div>
    </div>
  );
}

// ============ General Settings ============
function GeneralSettings() {
  const { toast, unitName, setUnitName } = useApp();
  const [name, setName] = useState(unitName || '');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getGeneral().then(d => {
      setName(d.unitName || '');
      setSpreadsheetId(d.spreadsheetId || '');
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateGeneral({ unitName: name });
      setUnitName(name);
      toast.success('設定を保存しました');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="card-header"><h2 className="settings-section-title">基本設定</h2></div>
      <div className="card-body">
        <div className="form-group">
          <label className="form-label">単会名</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} style={{ maxWidth: 400 }} />
        </div>
        {spreadsheetId && (
          <div className="form-group">
            <label className="form-label">スプレッドシート</label>
            <a
              href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
            >
              <Icon name="open_in_new" size={16} /> Googleスプレッドシートを開く
            </a>
          </div>
        )}
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存する'}
        </button>
      </div>
    </div>
  );
}

// ============ User Settings ============
function UserSettings() {
  const { toast } = useApp();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    try {
      const res = await api.getUsers();
      setUsers(res.users);
    } catch (err) {
      toast.error('ユーザー一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!newEmail.trim()) { toast.warning('メールアドレスを入力してください'); return; }
    try {
      await api.addUser({ email: newEmail.trim(), name: newName.trim() });
      toast.success('ユーザーを追加しました（スプレッドシートの共有権限も付与されます）');
      setNewEmail('');
      setNewName('');
      setShowAdd(false);
      loadUsers();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDelete(u) {
    if (!confirm(`${u.name || u.email} を削除しますか？\nスプレッドシートの共有権限も削除されます。`)) return;
    try {
      await api.deleteUser(u.id);
      toast.success('ユーザーを削除しました');
      loadUsers();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>;

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="settings-section-title">ユーザー管理</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          <Icon name="person_add" size={16} /> 追加
        </button>
      </div>
      <div className="card-body">
        <p className="settings-help">
          ここで追加されたユーザーのみがシステムにログインできます。<br />
          追加するとGoogleスプレッドシートの共有権限（編集者）も自動付与されます。
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th>名前</th>
              <th>メールアドレス</th>
              <th>ロール</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {u.picture ? <img src={u.picture} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} /> : null}
                    <span style={{ fontWeight: 500 }}>{u.name}</span>
                  </div>
                </td>
                <td>{u.email}</td>
                <td><span className={`badge ${u.role === 'owner' ? 'badge-primary' : 'badge-info'}`}>{u.role === 'owner' ? 'オーナー' : 'メンバー'}</span></td>
                <td>
                  {u.role !== 'owner' && (
                    <button className="btn-icon" onClick={() => handleDelete(u)} title="削除">
                      <Icon name="delete" size={18} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>ユーザー追加</h2>
              <button className="btn-icon" onClick={() => setShowAdd(false)}><Icon name="close" size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Googleアカウントのメールアドレス *</label>
                <input className="form-input" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="例：tanaka@gmail.com" />
              </div>
              <div className="form-group">
                <label className="form-label">表示名</label>
                <input className="form-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="例：田中 花子" />
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

// ============ Status Settings ============
function StatusSettings() {
  const { toast } = useApp();
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await api.getStatuses();
      setStatuses(res.statuses);
    } catch (err) {
      toast.error('取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    try {
      await api.addStatus({ name: newName.trim(), order: String(statuses.length + 1) });
      setNewName('');
      toast.success('選択肢を追加しました');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDelete(s) {
    if (!confirm(`「${s.name}」を削除しますか？`)) return;
    try {
      await api.deleteStatus(s._rowIndex);
      toast.success('削除しました');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>;

  return (
    <div className="card">
      <div className="card-header"><h2 className="settings-section-title">入会ステータス選択肢</h2></div>
      <div className="card-body">
        <p className="settings-help">会員名簿の「入会ステータス」ドロップダウンに表示される選択肢を管理します。</p>
        <div className="option-list">
          {statuses.map((s, i) => (
            <div key={i} className="option-item">
              <span className="option-order">{s.order}</span>
              <span className="option-name">{s.name}</span>
              <button className="btn-icon" onClick={() => handleDelete(s)}><Icon name="close" size={16} /></button>
            </div>
          ))}
        </div>
        <div className="add-option-row">
          <input className="form-input" placeholder="新しい選択肢名..." value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()} style={{ flex: 1 }} />
          <button className="btn btn-primary btn-sm" onClick={handleAdd}><Icon name="add" size={16} /> 追加</button>
        </div>
      </div>
    </div>
  );
}

// ============ Custom Field Settings ============
function CustomFieldSettings() {
  const { toast } = useApp();
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newFieldName, setNewFieldName] = useState('');
  const [expandedField, setExpandedField] = useState(null);
  const [newOptionName, setNewOptionName] = useState('');
  const [editingNameId, setEditingNameId] = useState(null);
  const [editingNameValue, setEditingNameValue] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await api.getCustomFields();
      setFields(res.fields);
    } catch (err) {
      toast.error('取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddField() {
    if (!newFieldName.trim()) return;
    try {
      await api.addCustomField({ name: newFieldName.trim(), type: 'select', order: String(fields.length + 1) });
      setNewFieldName('');
      toast.success('カスタムフィールドを追加しました（名簿シートに列が追加されます）');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDeleteField(f) {
    if (!confirm(`「${f.name}」を無効にしますか？\nスプレッドシートの列は残りますが、システムからは非表示になります。`)) return;
    try {
      await api.deleteCustomField(f.id);
      toast.success('カスタムフィールドを無効にしました');
      setExpandedField(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleAddOption(fieldId) {
    if (!newOptionName.trim()) return;
    try {
      const field = fields.find(f => f.id === fieldId);
      await api.addCustomFieldOption(fieldId, {
        name: newOptionName.trim(),
        order: String((field?.options?.length || 0) + 1),
      });
      setNewOptionName('');
      toast.success('選択肢を追加しました');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDeleteOption(fieldId, rowIndex) {
    try {
      await api.deleteCustomFieldOption(fieldId, rowIndex);
      toast.success('選択肢を削除しました');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  function startEditName(f) {
    setEditingNameId(f.id);
    setEditingNameValue(f.name);
  }

  async function handleSaveName(fieldId) {
    const trimmed = editingNameValue.trim();
    if (!trimmed) return;
    const original = fields.find(f => f.id === fieldId);
    if (original && original.name === trimmed) {
      setEditingNameId(null);
      return;
    }
    try {
      await api.updateCustomField(fieldId, { name: trimmed });
      toast.success('フィールド名を変更しました');
      setEditingNameId(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>;

  return (
    <div className="card">
      <div className="card-header"><h2 className="settings-section-title">カスタムフィールド</h2></div>
      <div className="card-body">
        <p className="settings-help">
          会員名簿に独自の選択肢フィールドを追加できます。<br />
          追加すると、Googleスプレッドシートの「会員名簿」シートに新しい列が自動追加されます。<br />
          例：「BNI明朗チャプターステータス」「紹介者」など
        </p>

        {fields.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-lg)' }}>
            まだカスタムフィールドが設定されていません
          </p>
        ) : (
          <div className="cf-list">
            {fields.map(f => (
              <div key={f.id} className="cf-item">
                <div className="cf-item-header" onClick={() => setExpandedField(expandedField === f.id ? null : f.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                    <Icon name={expandedField === f.id ? 'expand_less' : 'expand_more'} size={20} />
                    {editingNameId === f.id ? (
                      <input
                        className="form-input"
                        style={{ width: '200px', padding: '0.2rem 0.5rem', fontSize: 'var(--font-size-sm)' }}
                        value={editingNameValue}
                        onChange={e => setEditingNameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveName(f.id); if (e.key === 'Escape') setEditingNameId(null); }}
                        onBlur={() => handleSaveName(f.id)}
                        onClick={e => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <>
                        <span className="cf-item-name">{f.name}</span>
                        <button className="btn-icon" onClick={e => { e.stopPropagation(); startEditName(f); }} title="名前を変更">
                          <Icon name="edit" size={14} />
                        </button>
                      </>
                    )}
                    <span className="badge badge-info">{f.options?.length || 0}個の選択肢</span>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={e => { e.stopPropagation(); handleDeleteField(f); }}>
                    <Icon name="delete" size={14} /> 無効化
                  </button>
                </div>
                {expandedField === f.id && (
                  <div className="cf-item-body">
                    <div className="option-list">
                      {(f.options || []).map((o, i) => (
                        <div key={i} className="option-item">
                          <span className="option-order">{o.order}</span>
                          <span className="option-name">{o.name}</span>
                          <button className="btn-icon" onClick={() => handleDeleteOption(f.id, o._rowIndex)}>
                            <Icon name="close" size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="add-option-row">
                      <input
                        className="form-input"
                        placeholder="新しい選択肢名..."
                        value={newOptionName}
                        onChange={e => setNewOptionName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddOption(f.id)}
                        style={{ flex: 1 }}
                      />
                      <button className="btn btn-primary btn-sm" onClick={() => handleAddOption(f.id)}>
                        <Icon name="add" size={16} /> 追加
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 'var(--space-lg)', padding: 'var(--space-md)', background: 'var(--color-bg)', borderRadius: 'var(--radius-md)' }}>
          <label className="form-label">新しいカスタムフィールドを追加</label>
          <div className="add-option-row">
            <input
              className="form-input"
              placeholder="フィールド名（例：BNI明朗チャプターステータス）"
              value={newFieldName}
              onChange={e => setNewFieldName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddField()}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={handleAddField}>
              <Icon name="add_circle" size={18} /> フィールド追加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ Event Type Settings ============
function EventTypeSettings() {
  const { toast } = useApp();
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await api.getEventTypeSettings();
      setTypes(res.types);
    } catch (err) {
      toast.error('取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!newName.trim()) return;
    try {
      await api.addEventType({ name: newName.trim(), order: String(types.length + 1) });
      setNewName('');
      toast.success('イベント種類を追加しました');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDelete(t) {
    if (!confirm(`「${t.name}」を削除しますか？`)) return;
    try {
      await api.deleteEventType(t._rowIndex);
      toast.success('削除しました');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>;

  return (
    <div className="card">
      <div className="card-header"><h2 className="settings-section-title">イベント種類</h2></div>
      <div className="card-body">
        <p className="settings-help">イベント作成時に選択できる種類を管理します。種類ごとに参加率が集計されます。</p>
        <div className="option-list">
          {types.map((t, i) => (
            <div key={i} className="option-item">
              <span className="option-order">{t.order}</span>
              <span className="option-name">{t.name}</span>
              <button className="btn-icon" onClick={() => handleDelete(t)}><Icon name="close" size={16} /></button>
            </div>
          ))}
        </div>
        <div className="add-option-row">
          <input className="form-input" placeholder="新しい種類名..." value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()} style={{ flex: 1 }} />
          <button className="btn btn-primary btn-sm" onClick={handleAdd}><Icon name="add" size={16} /> 追加</button>
        </div>
      </div>
    </div>
  );
}
