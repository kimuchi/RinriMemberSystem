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
    { key: 'dashboard', label: 'ダッシュボード', icon: 'dashboard' },
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
        {tab === 'dashboard' && <DashboardCardSettings />}
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
  const [checkItems, setCheckItems] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getGeneral().then(d => {
      setName(d.unitName || '');
      setSpreadsheetId(d.spreadsheetId || '');
      setCheckItems(d.attendanceCheckItems || '');
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateGeneral({ unitName: name, attendanceCheckItems: checkItems });
      setUnitName(name);
      toast.success('設定を保存しました');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
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
          <div className="form-group">
            <label className="form-label">出席登録リスト チェック項目（既定）</label>
            <input
              className="form-input"
              value={checkItems}
              onChange={e => setCheckItems(e.target.value)}
              placeholder="例: 朝礼, MS, 朝食会"
              style={{ maxWidth: 600 }}
            />
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>
              イベント詳細から出力する「出席登録リスト(Excel)」のチェック列の既定値。カンマ区切り。
              出力時にイベントごとに編集できます。
            </p>
          </div>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>

      <NormalizeNamesCard />
    </>
  );
}

// ============ 氏名正規化 ============
function NormalizeNamesCard() {
  const { toast } = useApp();
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [executing, setExecuting] = useState(false);

  async function handlePreview() {
    setLoading(true);
    try {
      const res = await api.previewNormalizeNames();
      setPreview(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    if (!preview) return;
    const total = preview.memberChanges.length + preview.attendanceChanges.length;
    if (total === 0) {
      toast.success('正規化が必要な氏名はありません');
      setPreview(null);
      return;
    }
    if (!confirm(`${preview.memberChanges.length}件の会員名簿、${preview.attendanceChanges.length}件のイベント出席の氏名を正規化します。実行しますか？\n（処理に数十秒かかる場合があります）`)) return;
    setExecuting(true);
    try {
      const res = await api.normalizeNames();
      const parts = [];
      if (res.memberNameChanged > 0) parts.push(`氏名 ${res.memberNameChanged}件`);
      if (res.memberFuriganaChanged > 0) parts.push(`ふりがな ${res.memberFuriganaChanged}件`);
      if (res.attendanceChanged > 0) parts.push(`出席記録 ${res.attendanceChanged}件`);
      toast.success(parts.length > 0 ? parts.join('、') + 'を正規化しました' : '変更はありませんでした');
      setPreview(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 'var(--space-lg)' }}>
      <div className="card-header"><h2 className="settings-section-title">データメンテナンス</h2></div>
      <div className="card-body">
        <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-xs)' }}>
          氏名・ふりがなの正規化
        </h3>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
          会員名簿の氏名・ふりがな、およびイベント出席の氏名から不要なスペース（全角・半角）を除去します。英語名のスペースは維持されます。
        </p>

        {!preview ? (
          <button className="btn btn-secondary" onClick={handlePreview} disabled={loading}>
            <Icon name="search" size={16} />
            {loading ? '確認中...' : '正規化対象を確認'}
          </button>
        ) : (
          <>
            <div style={{ marginBottom: 'var(--space-md)', padding: 'var(--space-md)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 'var(--font-size-sm)' }}>
                <strong>会員名簿:</strong> {preview.memberChanges.length} / {preview.totalMembers} 件が変更されます
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', marginTop: 4 }}>
                <strong>イベント出席:</strong> {preview.attendanceChanges.length} / {preview.totalAttendance} 件が変更されます
              </div>
            </div>

            {preview.memberChanges.length > 0 && (
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <h4 style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-xs)', color: 'var(--color-text-secondary)' }}>
                  会員名簿の変更内容
                </h4>
                <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-sm)' }}>
                  <table className="data-table" style={{ fontSize: 'var(--font-size-xs)' }}>
                    <thead>
                      <tr><th>項目</th><th>変更前</th><th>変更後</th></tr>
                    </thead>
                    <tbody>
                      {preview.memberChanges.flatMap(c => {
                        const rows = [];
                        if (c.name) rows.push(<tr key={`${c.id}-n`}><td>氏名</td><td>{c.name.from}</td><td><strong>{c.name.to}</strong></td></tr>);
                        if (c.furigana) rows.push(<tr key={`${c.id}-f`}><td>ふりがな</td><td>{c.furigana.from}</td><td><strong>{c.furigana.to}</strong></td></tr>);
                        return rows;
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {preview.attendanceChanges.length > 0 && (
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <h4 style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, marginBottom: 'var(--space-xs)', color: 'var(--color-text-secondary)' }}>
                  イベント出席の変更内容
                </h4>
                <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-sm)' }}>
                  <table className="data-table" style={{ fontSize: 'var(--font-size-xs)' }}>
                    <thead>
                      <tr><th>変更前</th><th>変更後</th></tr>
                    </thead>
                    <tbody>
                      {preview.attendanceChanges.map((c, i) => (
                        <tr key={i}><td>{c.name.from}</td><td><strong>{c.name.to}</strong></td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button className="btn btn-primary" onClick={handleExecute} disabled={executing}>
                <Icon name="check" size={16} />
                {executing ? '正規化中...' : '正規化を実行'}
              </button>
              <button className="btn btn-secondary" onClick={() => setPreview(null)} disabled={executing}>
                キャンセル
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============ Dashboard Card Settings ============

const CARD_COLOR_OPTIONS = [
  { key: 'primary', label: '青' },
  { key: 'info', label: 'シアン' },
  { key: 'success', label: '緑' },
  { key: 'warning', label: '黄' },
  { key: 'danger', label: '赤' },
  { key: 'muted', label: 'グレー' },
];

const ALL_MEMBERS_MARKER = '*';

function DashboardCardSettings() {
  const { toast } = useApp();
  const [cards, setCards] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([api.getDashboardCards(), api.getStatuses()]);
      setCards(c.cards);
      setStatuses(s.statuses.map(x => x.name));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  function startAdd() {
    setEditingId('new');
    setForm({
      label: '',
      icon: 'group',
      color: 'muted',
      statuses: [],
      allMembers: false,
      order: (cards.length + 1).toString(),
    });
  }

  function startEdit(card) {
    setEditingId(card.id);
    setForm({
      label: card.label,
      icon: card.icon,
      color: card.color,
      statuses: card.statuses.filter(s => s !== ALL_MEMBERS_MARKER),
      allMembers: card.statuses.includes(ALL_MEMBERS_MARKER),
      order: card.order || '99',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(null);
  }

  function toggleStatus(name) {
    setForm(f => {
      const set = new Set(f.statuses);
      if (set.has(name)) set.delete(name);
      else set.add(name);
      return { ...f, statuses: Array.from(set) };
    });
  }

  async function handleSave() {
    if (!form.label.trim()) {
      toast.warning('表示名を入力してください');
      return;
    }
    const payload = {
      label: form.label.trim(),
      icon: form.icon.trim() || 'group',
      color: form.color,
      statuses: form.allMembers ? [ALL_MEMBERS_MARKER] : form.statuses,
      order: parseInt(form.order) || 99,
    };
    try {
      if (editingId === 'new') {
        await api.addDashboardCard(payload);
        toast.success('カードを追加しました');
      } else {
        await api.updateDashboardCard(editingId, payload);
        toast.success('カードを更新しました');
      }
      cancelEdit();
      loadAll();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDelete(card) {
    if (!confirm(`「${card.label}」を削除してよろしいですか？`)) return;
    try {
      await api.deleteDashboardCard(card.id);
      toast.success('削除しました');
      loadAll();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 'var(--space-lg)' }}><div className="spinner" /></div>;
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="settings-section-title">ダッシュボードカード</h2>
        {editingId === null && (
          <button className="btn btn-primary btn-sm" onClick={startAdd}>
            <Icon name="add" size={16} /> カードを追加
          </button>
        )}
      </div>
      <div className="card-body">
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
          ダッシュボード上部のカードを編集できます。表示順は数字の小さい順で並びます。
        </p>

        {/* 既存カード一覧 */}
        {cards.length === 0 && editingId !== 'new' && (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>カードがありません</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {cards.map(card => (
            editingId === card.id ? (
              <DashboardCardForm
                key={card.id}
                form={form}
                setForm={setForm}
                statuses={statuses}
                toggleStatus={toggleStatus}
                onSave={handleSave}
                onCancel={cancelEdit}
              />
            ) : (
              <div key={card.id} className="dashboard-card-row">
                <div className={`stat-color-dot stat-${card.color}`} />
                <Icon name={card.icon || 'group'} size={20} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{card.label}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    {card.statuses.includes(ALL_MEMBERS_MARKER)
                      ? '名簿の全会員'
                      : (card.statuses.length > 0 ? card.statuses.join(' / ') : '（未設定）')}
                  </div>
                </div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>順{card.order}</span>
                <button className="btn btn-secondary btn-sm" onClick={() => startEdit(card)} disabled={editingId !== null}>
                  <Icon name="edit" size={14} /> 編集
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(card)} disabled={editingId !== null}>
                  <Icon name="delete" size={14} />
                </button>
              </div>
            )
          ))}

          {editingId === 'new' && (
            <DashboardCardForm
              form={form}
              setForm={setForm}
              statuses={statuses}
              toggleStatus={toggleStatus}
              onSave={handleSave}
              onCancel={cancelEdit}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DashboardCardForm({ form, setForm, statuses, toggleStatus, onSave, onCancel }) {
  return (
    <div className="dashboard-card-edit">
      <div className="form-row">
        <div className="form-group" style={{ flex: 2 }}>
          <label className="form-label">表示名</label>
          <input
            className="form-input"
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            placeholder="例: 登録済み会員"
          />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">表示順</label>
          <input
            className="form-input"
            type="number"
            value={form.order}
            onChange={e => setForm(f => ({ ...f, order: e.target.value }))}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">アイコン名（Material Icons）</label>
          <input
            className="form-input"
            value={form.icon}
            onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
            placeholder="例: how_to_reg, group_add, groups"
          />
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>
            <a href="https://fonts.google.com/icons?icon.set=Material+Icons&icon.style=Outlined" target="_blank" rel="noopener noreferrer">
              アイコン一覧
            </a>
            から名前を入力
          </p>
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label">色</label>
          <select className="form-select" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}>
            {CARD_COLOR_OPTIONS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">集計対象</label>
        <label className="bulk-check-item" style={{ padding: 'var(--space-xs) 0' }}>
          <input
            type="checkbox"
            checked={form.allMembers}
            onChange={e => setForm(f => ({ ...f, allMembers: e.target.checked }))}
          />
          <span><strong>名簿の全会員をカウント</strong>（ステータス問わず）</span>
        </label>
        {!form.allMembers && (
          <>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-xs)', marginBottom: 'var(--space-xs)' }}>
              チェックを入れた入会ステータスの会員数を合算します
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 4, border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-sm)', maxHeight: 240, overflowY: 'auto' }}>
              {statuses.length === 0 ? (
                <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>入会ステータス選択肢が登録されていません</span>
              ) : statuses.map(s => (
                <label key={s} className="bulk-check-item" style={{ padding: 4 }}>
                  <input
                    type="checkbox"
                    checked={form.statuses.includes(s)}
                    onChange={() => toggleStatus(s)}
                  />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
        <button className="btn btn-primary" onClick={onSave}>保存</button>
        <button className="btn btn-secondary" onClick={onCancel}>キャンセル</button>
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
  const [reordering, setReordering] = useState(false);

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

  // 並べ替え: oldIdx の項目を newIdx の位置に移動し、全項目の順番を 1〜N に振り直す
  async function reorderTo(oldIdx, newIdx) {
    if (oldIdx === newIdx || newIdx < 0 || newIdx >= statuses.length) return;
    const reordered = [...statuses];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);
    setReordering(true);
    try {
      // 表示順が変わる項目のみ更新
      await Promise.all(reordered.map((s, i) => {
        const newOrder = String(i + 1);
        if (s.order === newOrder) return null;
        return api.updateStatus(s._rowIndex, { order: newOrder });
      }).filter(Boolean));
      // 楽観的にUIを先に更新
      setStatuses(reordered.map((s, i) => ({ ...s, order: String(i + 1) })));
    } catch (err) {
      toast.error(err.message);
      load();
    } finally {
      setReordering(false);
    }
  }

  // ドラッグ&ドロップ用
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  function handleDragStart(idx) { setDragIdx(idx); }
  function handleDragOver(e, idx) {
    e.preventDefault();
    if (dragIdx === null) return;
    if (overIdx !== idx) setOverIdx(idx);
  }
  function handleDragEnd() {
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      reorderTo(dragIdx, overIdx);
    }
    setDragIdx(null);
    setOverIdx(null);
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>;

  return (
    <div className="card">
      <div className="card-header"><h2 className="settings-section-title">入会ステータス選択肢</h2></div>
      <div className="card-body">
        <p className="settings-help">
          会員名簿の「入会ステータス」ドロップダウンに表示される選択肢を管理します。<br />
          並べ替えは <Icon name="drag_indicator" size={14} /> をドラッグするか、▲▼ボタンで操作できます。会員一覧やダッシュボード、エクスポートの並び順にも反映されます。
        </p>
        <div className="option-list">
          {statuses.map((s, i) => (
            <div
              key={s._rowIndex}
              className={`option-item ${overIdx === i && dragIdx !== null ? 'option-drop-target' : ''} ${dragIdx === i ? 'option-dragging' : ''}`}
              draggable={!reordering}
              onDragStart={() => handleDragStart(i)}
              onDragOver={e => handleDragOver(e, i)}
              onDragEnd={handleDragEnd}
              onDrop={handleDragEnd}
            >
              <span className="option-drag-handle" title="ドラッグして並べ替え">
                <Icon name="drag_indicator" size={16} />
              </span>
              <span className="option-order">{s.order}</span>
              <span className="option-name">{s.name}</span>
              <div className="option-reorder-buttons">
                <button
                  className="btn-icon"
                  onClick={() => reorderTo(i, i - 1)}
                  disabled={reordering || i === 0}
                  title="上へ"
                >
                  <Icon name="arrow_upward" size={14} />
                </button>
                <button
                  className="btn-icon"
                  onClick={() => reorderTo(i, i + 1)}
                  disabled={reordering || i === statuses.length - 1}
                  title="下へ"
                >
                  <Icon name="arrow_downward" size={14} />
                </button>
              </div>
              <button className="btn-icon" onClick={() => handleDelete(s)} disabled={reordering}>
                <Icon name="close" size={16} />
              </button>
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
