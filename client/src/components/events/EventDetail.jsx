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

  // エクスポートモーダル
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFields, setExportFields] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [selectedCols, setSelectedCols] = useState(new Set());
  const [exporting, setExporting] = useState(false);

  // 出席登録リスト（受付用）モーダル
  const [showListModal, setShowListModal] = useState(false);
  const [listCheckItems, setListCheckItems] = useState('');
  const [listWalkInRows, setListWalkInRows] = useState(10);
  const [listLoading, setListLoading] = useState(false);
  const [listFields, setListFields] = useState(null);                // 出力候補（basic/custom/extra/attendanceInfoColumns）
  const [listSelectedMember, setListSelectedMember] = useState(new Set()); // 選択した会員列名
  const [listIncludeStatus, setListIncludeStatus] = useState(true);  // 事前登録列を含める
  const [listSelectedInfo, setListSelectedInfo] = useState(new Set());

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
      await api.addAttendanceBulk(id, members, '事前登録');
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
    const newStatus = att.status === '出席' ? '事前登録' : '出席';
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

  // エクスポート
  async function openExportModal() {
    setShowExportModal(true);
    if (exportFields) return;
    setExportLoading(true);
    try {
      const res = await api.getExportFields(id);
      setExportFields(res);
      // デフォルト: 氏名・出席状態・主要連絡先
      const defaults = new Set([
        'member:氏名',
        'member:ふりがな',
        'attendance:出席状態',
        'member:会社名',
        'member:メールアドレス',
      ]);
      const allCols = [...(res.attendance || []), ...(res.basic || []), ...(res.custom || []), ...(res.extra || [])];
      const initial = new Set();
      allCols.forEach(c => { if (defaults.has(c.key)) initial.add(c.key); });
      setSelectedCols(initial);
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

  function toggleExportGroup(group) {
    const keys = group.map(c => c.key);
    const allChecked = keys.length > 0 && keys.every(k => selectedCols.has(k));
    setSelectedCols(prev => {
      const next = new Set(prev);
      keys.forEach(k => allChecked ? next.delete(k) : next.add(k));
      return next;
    });
  }

  async function handleExport() {
    if (!exportFields) return;
    if (selectedCols.size === 0) {
      toast.warning('1列以上選択してください');
      return;
    }
    // 表示順を保ってカラム配列を構築
    const ordered = [
      ...exportFields.attendance,
      ...exportFields.basic,
      ...exportFields.custom,
      ...exportFields.extra,
    ].filter(c => selectedCols.has(c.key));

    setExporting(true);
    try {
      await api.exportEventAttendees(id, ordered);
      toast.success('エクスポートしました');
      setShowExportModal(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  }

  // 受付用 出席登録リスト
  async function openListModal() {
    setShowListModal(true);
    try {
      const [gen, fields] = await Promise.all([
        api.getGeneral(),
        api.getAttendanceListFields(id),
      ]);
      setListCheckItems(gen.attendanceCheckItems || '');
      setListFields(fields);
      // デフォルト選択
      const defaultMember = new Set(['ふりがな', '会社名']);
      const allMember = [
        ...(fields.basic || []),
        ...(fields.custom || []),
        ...(fields.extra || []),
      ];
      // 氏名はデフォルト固定で含める（UIではチェック不可表示）
      defaultMember.add('氏名');
      const initial = new Set();
      allMember.forEach(c => { if (defaultMember.has(c.key)) initial.add(c.key); });
      setListSelectedMember(initial);
      setListIncludeStatus(true);
      setListSelectedInfo(new Set(fields.attendanceInfoColumns || []));
    } catch (err) {
      toast.error(err.message);
    }
  }

  function toggleListMember(key) {
    if (key === '氏名') return; // 氏名は常に含める
    setListSelectedMember(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleListMemberGroup(cols) {
    const keys = cols.map(c => c.key).filter(k => k !== '氏名');
    const allChecked = keys.length > 0 && keys.every(k => listSelectedMember.has(k));
    setListSelectedMember(prev => {
      const next = new Set(prev);
      keys.forEach(k => allChecked ? next.delete(k) : next.add(k));
      return next;
    });
  }

  function toggleInfoCol(col) {
    setListSelectedInfo(prev => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  }

  async function handleListExport() {
    if (!listFields) return;
    const items = listCheckItems
      .split(/[,、，]/)
      .map(s => s.trim())
      .filter(Boolean);
    // 表示順を保って会員列配列を構築
    const orderedMember = [
      ...(listFields.basic || []),
      ...(listFields.custom || []),
      ...(listFields.extra || []),
    ].filter(c => listSelectedMember.has(c.key) && c.key !== '氏名');

    setListLoading(true);
    try {
      await api.exportEventAttendanceList(id, {
        memberColumns: orderedMember,
        includeAttendanceStatus: listIncludeStatus,
        infoColumns: Array.from(listSelectedInfo),
        checkItems: items,
        walkInRows: Number(listWalkInRows) || 0,
      });
      toast.success('出席登録リストを出力しました');
      setShowListModal(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setListLoading(false);
    }
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>;
  }

  if (!event) return <div className="empty-state"><p>イベントが見つかりません</p></div>;

  const attended = attendance.filter(a => a.status === '出席').length;
  const preRegistered = attendance.filter(a => a.status === '事前登録').length;
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
            出席管理（当日出席 {attended}名 / 事前登録 {preRegistered}名 / 全{attendance.length}名）
          </h2>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            {attendance.length > 0 && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={openListModal}>
                  <Icon name="print" size={16} /> 出席登録リスト(Excel)
                </button>
                <button className="btn btn-secondary btn-sm" onClick={openExportModal}>
                  <Icon name="download" size={16} /> Excelエクスポート
                </button>
                <button
                  className={`btn btn-sm ${checkMode ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setCheckMode(!checkMode)}
                >
                  <Icon name="fact_check" size={16} />
                  {checkMode ? '通常モードに戻す' : '当日出席チェック'}
                </button>
              </>
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
                <Icon name="info" size={16} /> 名前をタップすると当日出席/事前登録を切り替えます
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
                          : a.status === '事前登録' ? { color: 'var(--color-primary)', background: 'var(--color-primary-bg, #eff6ff)' }
                          : {}}
                      >
                        <option value="事前登録">事前登録</option>
                        <option value="出席">出席（当日）</option>
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
          <div className="modal-content bulk-modal" onClick={e => e.stopPropagation()}>
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

      {/* エクスポートモーダル */}
      {showExportModal && (
        <div className="modal-overlay" onClick={() => !exporting && setShowExportModal(false)}>
          <div className="modal-content bulk-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Excelエクスポート</h2>
              <button className="btn-icon" onClick={() => setShowExportModal(false)} disabled={exporting}>
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="modal-body">
              {exportLoading ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-lg)' }}><div className="spinner" /></div>
              ) : !exportFields ? (
                <p style={{ color: 'var(--color-text-muted)' }}>列情報を取得できませんでした</p>
              ) : (
                <>
                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)' }}>
                    出力する列を選択してください（出席者{attendance.length}名）
                  </p>
                  <div className="bulk-list" style={{ maxHeight: 'none' }}>
                    {renderExportGroup('出席情報', exportFields.attendance)}
                    {renderExportGroup('基本情報', exportFields.basic)}
                    {exportFields.custom.length > 0 && renderExportGroup('カスタムフィールド', exportFields.custom)}
                    {exportFields.extra.length > 0 && renderExportGroup('追加列', exportFields.extra)}
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                {selectedCols.size}列 選択中
              </span>
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <button className="btn btn-secondary" onClick={() => setShowExportModal(false)} disabled={exporting}>
                  キャンセル
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleExport}
                  disabled={selectedCols.size === 0 || exporting || exportLoading}
                >
                  {exporting ? '出力中...' : 'エクスポート'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 出席登録リスト（受付用）モーダル */}
      {showListModal && (
        <div className="modal-overlay" onClick={() => !listLoading && setShowListModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>出席登録リスト（当日受付用）</h2>
              <button className="btn-icon" onClick={() => setShowListModal(false)} disabled={listLoading}>
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ overflowY: 'auto' }}>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
                A4縦・Meiryo UI で印刷できる受付名簿(Excel)を生成します。<br />
                事前登録者{attendance.length}名 ＋ ドタ参加用の空欄行を含みます。
                <span style={{ display: 'inline-block', marginLeft: 8, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                  列を多く選びすぎるとA4に収まらなくなることがあります。
                </span>
              </p>

              {!listFields ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-lg)' }}><div className="spinner" /></div>
              ) : (
                <>
                  {/* 会員列 */}
                  <div className="form-group">
                    <label className="form-label">出力する項目（会員情報）</label>
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 'var(--space-xs)' }}>
                      「氏名」は常に出力されます。
                    </p>
                    {renderListMemberGroup('基本情報', listFields.basic)}
                    {listFields.custom?.length > 0 && renderListMemberGroup('カスタムフィールド', listFields.custom)}
                    {listFields.extra?.length > 0 && renderListMemberGroup('追加列', listFields.extra)}
                  </div>

                  {/* 出席状態 */}
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={listIncludeStatus}
                        onChange={e => setListIncludeStatus(e.target.checked)}
                      />
                      <span><strong>事前登録</strong>列を含める（出席状態を表示）</span>
                    </label>
                  </div>

                  {/* 出席情報列 */}
                  {(listFields.attendanceInfoColumns || []).length > 0 && (
                    <div className="form-group">
                      <label className="form-label">自動出力する出席情報列（フォーム取込済の情報）</label>
                      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 'var(--space-xs)' }}>
                        懇親会出欠などを ○ で表示します（不参加/欠席/なし などは空欄）。
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                        {listFields.attendanceInfoColumns.map(col => (
                          <label key={col} className="bulk-check-item" style={{ padding: '4px 8px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                            <input
                              type="checkbox"
                              checked={listSelectedInfo.has(col)}
                              onChange={() => toggleInfoCol(col)}
                            />
                            <span>{col}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">参加チェック項目（カンマ区切り・手書き用）</label>
                    <input
                      className="form-input"
                      value={listCheckItems}
                      onChange={e => setListCheckItems(e.target.value)}
                      placeholder="例: 朝礼, MS, 朝食会"
                    />
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>
                      当日に手書きでチェックする列になります（空欄なら印刷されません）。
                    </p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">ドタ参加用の空欄行数</label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      max="50"
                      value={listWalkInRows}
                      onChange={e => setListWalkInRows(e.target.value)}
                      style={{ maxWidth: 120 }}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowListModal(false)} disabled={listLoading}>
                キャンセル
              </button>
              <button className="btn btn-primary" onClick={handleListExport} disabled={listLoading}>
                <Icon name="print" size={16} />
                {listLoading ? '生成中...' : 'ダウンロード'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function renderListMemberGroup(title, cols) {
    if (!cols || cols.length === 0) return null;
    const selectableKeys = cols.map(c => c.key).filter(k => k !== '氏名');
    const allChecked = selectableKeys.length > 0 && selectableKeys.every(k => listSelectedMember.has(k));
    return (
      <div style={{ marginBottom: 'var(--space-sm)' }}>
        <label className="bulk-check-item" style={{ fontWeight: 600, background: 'var(--color-bg-secondary)' }}>
          <input
            type="checkbox"
            checked={allChecked}
            onChange={() => toggleListMemberGroup(cols)}
            disabled={selectableKeys.length === 0}
          />
          <span>{title}</span>
          <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            {selectableKeys.filter(k => listSelectedMember.has(k)).length} / {selectableKeys.length}
          </span>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {cols.map(c => {
            const isName = c.key === '氏名';
            return (
              <label key={c.key} className="bulk-check-item" style={{ paddingLeft: 'var(--space-lg)' }}>
                <input
                  type="checkbox"
                  checked={isName ? true : listSelectedMember.has(c.key)}
                  onChange={() => toggleListMember(c.key)}
                  disabled={isName}
                />
                <span>{c.label}{isName ? '（常に出力）' : ''}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  function renderExportGroup(title, cols) {
    if (!cols || cols.length === 0) return null;
    const allChecked = cols.every(c => selectedCols.has(c.key));
    return (
      <div key={title}>
        <label className="bulk-check-item" style={{ fontWeight: 600, background: 'var(--color-bg-secondary)' }}>
          <input
            type="checkbox"
            checked={allChecked}
            onChange={() => toggleExportGroup(cols)}
          />
          <span>{title}</span>
          <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            {cols.filter(c => selectedCols.has(c.key)).length} / {cols.length}
          </span>
        </label>
        {cols.map(c => (
          <label key={c.key} className="bulk-check-item" style={{ paddingLeft: 'var(--space-lg)' }}>
            <input
              type="checkbox"
              checked={selectedCols.has(c.key)}
              onChange={() => toggleExportCol(c.key)}
            />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
    );
  }
}
