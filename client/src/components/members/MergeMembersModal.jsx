import React, { useState, useMemo } from 'react';
import { api } from '../../utils/api';
import { useApp } from '../../App';
import Icon from '../Icon';

// 会員API値 → スプレッドシート列名
const BASIC_FIELDS = [
  { key: 'corporateNumber',    col: '法人会員番号' },
  { key: 'name',               col: '氏名' },
  { key: 'furigana',           col: 'ふりがな' },
  { key: 'alias',              col: '別名' },
  { key: 'aliasFurigana',      col: '別名ふりがな' },
  { key: 'email',              col: 'メールアドレス' },
  { key: 'phone',              col: '携帯電話番号' },
  { key: 'company',            col: '会社名' },
  { key: 'address',            col: '住所' },
  { key: 'companyPhone',       col: '会社電話番号' },
  { key: 'memberStatus',       col: '入会ステータス' },
  { key: 'joinMonth',          col: '入会月' },
  { key: 'transferStartMonth', col: '振替開始月' },
  { key: 'notes',              col: '備考' },
];

export default function MergeMembersModal({ members, customFields, extraFields, onClose, onComplete }) {
  const { toast } = useApp();

  // 統合対象（呼び出し側で2件以上を保証している前提）
  // 既定の原本: 登録日が最も古いもの（無ければ最初の要素）
  const initialPrimary = useMemo(() => {
    const sorted = [...members].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    return sorted[0]?.id || members[0]?.id;
  }, [members]);

  const [primaryId, setPrimaryId] = useState(initialPrimary);
  const [executing, setExecuting] = useState(false);

  // 列ごとの統合フィールド定義を構築
  const fieldDefs = useMemo(() => {
    const defs = [];
    for (const f of BASIC_FIELDS) {
      defs.push({ key: f.key, col: f.col, kind: 'basic' });
    }
    for (const cf of customFields || []) {
      defs.push({ key: cf.id, col: cf.name, kind: 'custom' });
    }
    for (const col of extraFields || []) {
      defs.push({ key: col, col, kind: 'extra' });
    }
    return defs;
  }, [customFields, extraFields]);

  // 各列の値を取得
  function getValue(member, def) {
    if (def.kind === 'basic') return member[def.key] || '';
    if (def.kind === 'custom') return (member.customFields || {})[def.key] || '';
    if (def.kind === 'extra')  return (member.extraFields || {})[def.key] || '';
    return '';
  }

  // ユーザー選択（列ごと）: { col: { value, source } }
  // source: 'auto'（自動解決）/ 'pick'（選択）/ 'edit'（自由入力）
  // 未指定の場合は initialSelections に従う
  const [overrides, setOverrides] = useState({});

  // 自動解決ロジック:
  //  - 原本に値あり → 原本の値
  //  - 原本に値なし → 他の中で最初に見つかった非空の値
  //  - 全員空 → 空
  const initialSelections = useMemo(() => {
    const result = {};
    const primary = members.find(m => m.id === primaryId);
    for (const def of fieldDefs) {
      const pv = primary ? getValue(primary, def) : '';
      if (pv) {
        result[def.col] = pv;
      } else {
        const other = members.find(m => m.id !== primaryId && getValue(m, def));
        result[def.col] = other ? getValue(other, def) : '';
      }
    }
    return result;
  }, [members, primaryId, fieldDefs]);

  function getSelectedValue(def) {
    const o = overrides[def.col];
    if (o !== undefined) return o.value;
    return initialSelections[def.col] || '';
  }

  function pickValue(col, value) {
    setOverrides(prev => ({ ...prev, [col]: { value, source: 'pick' } }));
  }
  function editValue(col, value) {
    setOverrides(prev => ({ ...prev, [col]: { value, source: 'edit' } }));
  }

  async function handleExecute() {
    if (executing) return;
    setExecuting(true);
    try {
      // バックエンドへ渡す fields（プライマリと値が変わる列のみ送ればよいが、明示的に全部送る）
      const fields = {};
      for (const def of fieldDefs) {
        fields[def.col] = getSelectedValue(def);
      }
      const mergedIds = members.filter(m => m.id !== primaryId).map(m => m.id);
      const res = await api.mergeMembers({ primaryId, mergedIds, fields });
      const parts = [`${res.deletedMemberCount}件を統合`];
      if (res.transferredAttendanceCount > 0) parts.push(`出席履歴${res.transferredAttendanceCount}件を移行`);
      if (res.duplicateAttendanceRemoved > 0) parts.push(`重複出席${res.duplicateAttendanceRemoved}件を削除`);
      toast.success(parts.join('、') + 'しました');
      onComplete();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExecuting(false);
    }
  }

  // 表示用: メンバーの簡易ラベル
  function memberLabel(m) {
    const parts = [m.name || '(氏名なし)'];
    if (m.corporateNumber) parts.push(`#${m.corporateNumber}`);
    if (m.company) parts.push(m.company);
    return parts.join(' / ');
  }

  // 差異がある列だけ抽出（unique values が 2 以上）
  const conflictDefs = fieldDefs.filter(def => {
    const values = members.map(m => getValue(m, def)).filter(Boolean);
    return new Set(values).size > 1;
  });
  // 値が同じ or 1件のみ非空 → 自動マージ表示
  const autoDefs = fieldDefs.filter(def => !conflictDefs.includes(def));

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget && !executing) onClose(); }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: 720, maxWidth: '95vw' }}>
        <div className="modal-header">
          <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
            <Icon name="merge_type" size={20} /> 会員の統合 ({members.length}件)
          </h2>
          <button className="btn-icon" onClick={onClose} disabled={executing}>
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {/* 原本選択 */}
          <div className="form-group">
            <label className="form-label">原本（残す会員）を選択</label>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 'var(--space-xs)' }}>
              他の会員のレコードは削除され、イベント参加履歴は原本に統合されます。
            </p>
            <div className="merge-primary-list">
              {members.map(m => (
                <label key={m.id} className={`merge-primary-item ${primaryId === m.id ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="primary"
                    checked={primaryId === m.id}
                    onChange={() => { setPrimaryId(m.id); setOverrides({}); }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{memberLabel(m)}</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      登録: {(m.createdAt || '').slice(0, 10) || '不明'}
                      {m.allEvents?.length > 0 && ` ・ 出席履歴 ${m.allEvents.length}件`}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 差異のある列（手動解決） */}
          {conflictDefs.length > 0 && (
            <div className="form-group">
              <label className="form-label">情報に差異がある項目</label>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 'var(--space-xs)' }}>
                どの値を採用するか選んでください（既定: 原本の値、または唯一の非空値）。
              </p>
              <div className="merge-conflict-list">
                {conflictDefs.map(def => {
                  const selected = getSelectedValue(def);
                  const editing = overrides[def.col]?.source === 'edit';
                  const uniqueValues = [...new Set(members.map(m => getValue(m, def)))];
                  return (
                    <div key={def.col} className="merge-conflict-row">
                      <div className="merge-conflict-field">{def.col}</div>
                      <div className="merge-conflict-options">
                        {uniqueValues.map(v => {
                          const owners = members.filter(m => getValue(m, def) === v).map(m => m.name || '?');
                          return (
                            <label
                              key={v || '__empty__'}
                              className={`merge-conflict-opt ${selected === v && !editing ? 'selected' : ''}`}
                            >
                              <input
                                type="radio"
                                name={`merge-${def.col}`}
                                checked={selected === v && !editing}
                                onChange={() => pickValue(def.col, v)}
                              />
                              <span className="merge-conflict-value">{v || <em style={{ color: 'var(--color-text-muted)' }}>(空欄)</em>}</span>
                              <span className="merge-conflict-owner">{owners.join(', ')}</span>
                            </label>
                          );
                        })}
                        <label className={`merge-conflict-opt ${editing ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name={`merge-${def.col}`}
                            checked={editing}
                            onChange={() => editValue(def.col, selected || '')}
                          />
                          <span className="merge-conflict-value" style={{ flex: 1 }}>
                            <input
                              className="form-input"
                              style={{ padding: '2px 6px', fontSize: 'var(--font-size-sm)' }}
                              value={editing ? selected : ''}
                              placeholder="自由入力..."
                              onFocus={() => { if (!editing) editValue(def.col, selected || ''); }}
                              onChange={e => editValue(def.col, e.target.value)}
                            />
                          </span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 自動マージ列（折りたたみ表示） */}
          {autoDefs.some(def => getSelectedValue(def)) && (
            <details className="form-group">
              <summary style={{ cursor: 'pointer', fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>
                自動マージされる項目を表示
              </summary>
              <div style={{ marginTop: 'var(--space-sm)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 'var(--font-size-sm)' }}>
                {autoDefs.filter(def => getSelectedValue(def)).map(def => (
                  <React.Fragment key={def.col}>
                    <div style={{ color: 'var(--color-text-secondary)' }}>{def.col}</div>
                    <div>{getSelectedValue(def)}</div>
                  </React.Fragment>
                ))}
              </div>
            </details>
          )}
        </div>
        <div className="modal-footer">
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            <Icon name="warning" size={16} style={{ color: 'var(--color-warning)' }} />
            {' '}原本以外の{members.length - 1}件を削除します（取り消しできません）
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={executing}>キャンセル</button>
            <button className="btn btn-primary" onClick={handleExecute} disabled={executing}>
              <Icon name="merge_type" size={16} />
              {executing ? '統合中...' : '統合を実行'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
