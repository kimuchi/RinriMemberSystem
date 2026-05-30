import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { useApp } from '../../App';
import Icon from '../Icon';

/**
 * フォーム連携コンポーネント
 * Googleフォーム回答スプレッドシートからの取り込み機能
 */
export default function FormImport({ eventId, onImported }) {
  const { toast } = useApp();

  // 状態管理
  const [step, setStep] = useState('loading'); // loading | nolink | mapping | ready | preview | importing
  const [config, setConfig] = useState(null);

  // 接続
  const [spreadsheetInput, setSpreadsheetInput] = useState('');
  const [connecting, setConnecting] = useState(false);

  // マッピング設定
  const [connectResult, setConnectResult] = useState(null);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [fieldMap, setFieldMap] = useState({});
  const [nameField, setNameField] = useState('');
  const [participationField, setParticipationField] = useState('');
  const [skipValues, setSkipValues] = useState('');
  const [saving, setSaving] = useState(false);

  // プレビュー
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  // 差分解決
  const [diffResolutions, setDiffResolutions] = useState({});
  // 既存会員の登録チェック（デフォルトON）
  const [matchedChecked, setMatchedChecked] = useState(new Set());

  // 重複回答の選択（duplicateGroup → 選択したformRow）
  const [dupSelection, setDupSelection] = useState({});

  // 新規会員登録（未照合）
  const [newMemberChecked, setNewMemberChecked] = useState(new Set());
  const [newMemberEdits, setNewMemberEdits] = useState({});

  // 実行
  const [executing, setExecuting] = useState(false);

  useEffect(() => { loadConfig(); }, [eventId]);

  async function loadConfig() {
    try {
      const res = await api.getFormConfig(eventId);
      if (res.linked) {
        setConfig(res);
        setStep('ready');
      } else {
        setStep('nolink');
      }
    } catch (err) {
      setStep('nolink');
    }
  }

  // --- 接続 ---
  async function handleConnect() {
    if (!spreadsheetInput.trim()) {
      toast.warning('スプレッドシートのURLまたはIDを入力してください');
      return;
    }
    setConnecting(true);
    try {
      const res = await api.connectForm(eventId, spreadsheetInput, '');
      setConnectResult(res);
      setSelectedSheet(res.selectedSheet);
      // 初期マッピングを推測
      const autoMap = {};
      const autoName = guessNameField(res.formHeaders);
      setNameField(autoName);
      for (const fh of res.formHeaders) {
        const match = res.memberFields.find(mf => fh.includes(mf) || mf.includes(fh));
        if (match) autoMap[fh] = match;
      }
      setFieldMap(autoMap);
      setStep('mapping');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setConnecting(false);
    }
  }

  function guessNameField(headers) {
    const namePatterns = ['氏名', '名前', 'お名前', '姓名'];
    for (const p of namePatterns) {
      const found = headers.find(h => h.includes(p));
      if (found) return found;
    }
    return headers[0] || '';
  }

  async function handleSheetChange(sheetName) {
    setSelectedSheet(sheetName);
    setConnecting(true);
    try {
      const res = await api.connectForm(eventId, connectResult.spreadsheetId, sheetName);
      setConnectResult(res);
      setFieldMap({});
      setNameField(guessNameField(res.formHeaders));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setConnecting(false);
    }
  }

  // --- マッピング保存 ---
  async function handleSaveMapping() {
    if (!nameField) {
      toast.warning('氏名に対応するフォーム列を選択してください');
      return;
    }
    // 新規列（既存の会員フィールドに含まれない値）を抽出
    const memberFieldsSet = new Set(connectResult?.memberFields || []);
    const newColumns = Array.from(new Set(
      Object.values(fieldMap)
        .map(v => (v || '').trim())
        .filter(v => v && !memberFieldsSet.has(v))
    ));
    // 名前未入力の新規列を検出
    const hasBlankNewColumn = Object.entries(fieldMap).some(([fh, v]) => {
      const trimmed = (v || '').trim();
      return v && !trimmed; // 値はあるが trim 後に空（スペースのみ等）
    });
    if (hasBlankNewColumn) {
      toast.warning('新規列名が未入力の項目があります');
      return;
    }
    setSaving(true);
    try {
      const skipArr = skipValues.split(',').map(s => s.trim()).filter(Boolean);
      const res = await api.saveFormMapping(eventId, {
        spreadsheetId: connectResult.spreadsheetId,
        sheetName: selectedSheet,
        mapping: {
          fieldMap,
          nameField,
          participationField: participationField || null,
          skipValues: skipArr.length > 0 ? skipArr : null,
        },
        newColumns,
      });
      if (res.addedColumns && res.addedColumns.length > 0) {
        toast.success(`マッピングを保存しました（新規列${res.addedColumns.length}件を追加）`);
      } else {
        toast.success('マッピングを保存しました');
      }
      await loadConfig();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  // --- プレビュー ---
  async function handlePreview() {
    setPreviewing(true);
    setPreview(null);
    setDiffResolutions({});
    setNewMemberChecked(new Set());
    setNewMemberEdits({});
    setDupSelection({});
    try {
      const res = await api.previewFormImport(eventId);
      setPreview(res);

      // デフォルトの差分解決:
      //   - 名簿側が空の場合 → フォームの値を採用（あとから追加した列等を取り込むため）
      //   - 名簿側に既存値あり → 名簿の値を維持
      const defaults = {};
      for (const entry of res.entries) {
        if (entry.diffs.length > 0 && entry.matched) {
          defaults[entry.formRow] = {};
          for (const diff of entry.diffs) {
            const memberEmpty = !diff.memberValue || !String(diff.memberValue).trim();
            defaults[entry.formRow][diff.field] = memberEmpty
              ? { value: diff.formValue, source: 'form' }
              : { value: diff.memberValue, source: 'member' };
          }
        }
      }
      setDiffResolutions(defaults);
      // 重複グループのデフォルト選択（最後の回答を採用）
      const dupDefaults = {};
      for (const entry of res.entries) {
        if (entry.duplicateGroup) {
          dupDefaults[entry.duplicateGroup] = entry.formRow; // 後の方が上書き
        }
      }
      setDupSelection(dupDefaults);

      // デフォルトで照合済み（未登録）を全員チェック（重複は選択された方のみ）
      const checkedSet = new Set();
      for (const entry of res.entries) {
        if (entry.matched && !entry.alreadyRegistered) {
          if (entry.duplicateGroup) {
            if (dupDefaults[entry.duplicateGroup] === entry.formRow) {
              checkedSet.add(entry.formRow);
            }
          } else {
            checkedSet.add(entry.formRow);
          }
        }
      }
      setMatchedChecked(checkedSet);
      setStep('preview');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPreviewing(false);
    }
  }

  function handleDiffChoice(formRow, field, source, value) {
    setDiffResolutions(prev => ({
      ...prev,
      [formRow]: {
        ...prev[formRow],
        [field]: { value, source },
      },
    }));
  }

  function handleDiffEdit(formRow, field, value) {
    setDiffResolutions(prev => ({
      ...prev,
      [formRow]: {
        ...prev[formRow],
        [field]: { value, source: 'edit' },
      },
    }));
  }

  // --- 実行 ---
  async function handleExecute() {
    if (!preview) return;

    const toImport = preview.entries.filter(e => e.matched && !e.alreadyRegistered && matchedChecked.has(e.formRow));
    const toAddNew = preview.entries.filter(e => !e.matched && newMemberChecked.has(e.formRow));

    if (toImport.length === 0 && toAddNew.length === 0) {
      toast.warning('取り込む対象がありません');
      return;
    }

    setExecuting(true);
    try {
      const entries = toImport.map(e => {
        const updates = {};
        const resolved = diffResolutions[e.formRow];
        if (resolved) {
          for (const [field, resolution] of Object.entries(resolved)) {
            if (resolution.source !== 'member') {
              updates[field] = resolution.value;
            }
          }
        }
        return {
          memberId: e.memberId,
          memberName: e.memberName,
          participationType: e.participationType,
          updates,
        };
      });

      // 新規会員
      const newMembers = toAddNew.map(e => {
        const edits = newMemberEdits[e.formRow] || {};
        const fields = { ...e.mappedFormData, ...edits };
        const name = edits['氏名'] || e.formName;
        return {
          name,
          participationType: e.participationType,
          fields,
        };
      });

      const res = await api.executeFormImport(eventId, entries, newMembers);
      const msgs = [];
      if (res.registeredCount > 0) msgs.push(`${res.registeredCount}名の出席を登録`);
      if (res.newMemberCount > 0) msgs.push(`${res.newMemberCount}名を名簿に追加`);
      if (res.updatedCount > 0) msgs.push(`${res.updatedCount}名の情報を更新`);
      toast.success(msgs.join('、') + 'しました');
      setStep('ready');
      setPreview(null);
      if (onImported) onImported();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExecuting(false);
    }
  }

  // --- 連携解除 ---
  async function handleUnlink() {
    if (!confirm('フォーム連携を解除しますか？')) return;
    try {
      await api.deleteFormLink(eventId);
      setConfig(null);
      setStep('nolink');
      toast.success('フォーム連携を解除しました');
    } catch (err) {
      toast.error(err.message);
    }
  }

  // ==================== レンダリング ====================

  if (step === 'loading') {
    return <div className="card"><div className="card-body" style={{ textAlign: 'center', padding: 'var(--space-lg)' }}><div className="spinner" /></div></div>;
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600 }}>
          <Icon name="description" size={18} /> フォーム連携
        </h2>
        {step === 'ready' && (
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button className="btn btn-secondary btn-sm" onClick={handleConnect2}>
              <Icon name="settings" size={16} /> 設定変更
            </button>
            <button className="btn btn-danger btn-sm" onClick={handleUnlink}>
              <Icon name="link_off" size={16} /> 解除
            </button>
          </div>
        )}
      </div>
      <div className="card-body">
        {step === 'nolink' && renderConnectForm()}
        {step === 'mapping' && renderMapping()}
        {step === 'ready' && renderReady()}
        {step === 'preview' && renderPreview()}
      </div>
    </div>
  );

  // --- 再接続（設定変更時） ---
  async function handleConnect2() {
    if (!config) return;
    setConnecting(true);
    try {
      const res = await api.connectForm(eventId, config.spreadsheetId, config.sheetName);
      setConnectResult(res);
      setSelectedSheet(config.sheetName);
      // 既存マッピングを復元
      if (config.mapping) {
        setFieldMap(config.mapping.fieldMap || {});
        setNameField(config.mapping.nameField || '');
        setParticipationField(config.mapping.participationField || '');
        setSkipValues((config.mapping.skipValues || []).join(', '));
      }
      setStep('mapping');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setConnecting(false);
    }
  }

  // --- 接続フォーム ---
  function renderConnectForm() {
    return (
      <div>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
          Googleフォームの回答スプレッドシートを連携すると、フォーム回答から出席を一括登録できます。
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 250, marginBottom: 0 }}>
            <label className="form-label">スプレッドシートURL または ID</label>
            <input
              className="form-input"
              value={spreadsheetInput}
              onChange={e => setSpreadsheetInput(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
            />
          </div>
          <button className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
            {connecting ? '接続中...' : '接続'}
          </button>
        </div>
      </div>
    );
  }

  // --- マッピング設定 ---
  function renderMapping() {
    if (!connectResult) return null;
    const { formHeaders, memberFields, sheetNames } = connectResult;

    return (
      <div className="form-mapping">
        {/* シート選択 */}
        {sheetNames && sheetNames.length > 1 && (
          <div className="form-group">
            <label className="form-label">シート選択</label>
            <select className="form-select" value={selectedSheet} onChange={e => handleSheetChange(e.target.value)}>
              {sheetNames.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        {/* 氏名フィールド（照合キー） */}
        <div className="form-group">
          <label className="form-label">氏名に対応するフォーム列 *（名簿との照合に使用）</label>
          <select className="form-select" value={nameField} onChange={e => setNameField(e.target.value)}>
            <option value="">-- 選択 --</option>
            {formHeaders.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        {/* フィールドマッピング */}
        <div className="form-group">
          <label className="form-label">フィールド対応（フォーム列 → 会員名簿の列）</label>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 0, marginBottom: 'var(--space-sm)' }}>
            既存の列にない項目は「+ 新規列として追加」を選ぶと、保存時に会員名簿シートへ列が追加されます。
          </p>
          <div className="mapping-table">
            {formHeaders.filter(h => h !== nameField).map(fh => {
              const current = fieldMap[fh] || '';
              const isNew = !!current && !memberFields.includes(current);
              return (
                <div key={fh} className="mapping-row">
                  <span className="mapping-form-col">{fh}</span>
                  <Icon name="arrow_forward" size={16} style={{ color: 'var(--color-text-muted)' }} />
                  <select
                    className="form-select mapping-member-col"
                    value={isNew ? '__new__' : current}
                    onChange={e => {
                      const v = e.target.value;
                      if (v === '__new__') {
                        setFieldMap(prev => ({ ...prev, [fh]: fh }));
                      } else {
                        setFieldMap(prev => ({ ...prev, [fh]: v }));
                      }
                    }}
                  >
                    <option value="">（スキップ）</option>
                    {memberFields.map(mf => <option key={mf} value={mf}>{mf}</option>)}
                    <option value="__new__">+ 新規列として追加...</option>
                  </select>
                  {isNew && (
                    <input
                      className="form-input mapping-new-col"
                      value={current}
                      onChange={e => setFieldMap(prev => ({ ...prev, [fh]: e.target.value }))}
                      placeholder="新規列名"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 参加/不参加フィールド */}
        <div className="form-group">
          <label className="form-label">参加/不参加を示すフォーム列（任意）</label>
          <select className="form-select" value={participationField} onChange={e => setParticipationField(e.target.value)}>
            <option value="">（なし - 全員参加として扱う）</option>
            {formHeaders.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        {participationField && (
          <div className="form-group">
            <label className="form-label">不参加とみなす値（カンマ区切り）</label>
            <input
              className="form-input"
              value={skipValues}
              onChange={e => setSkipValues(e.target.value)}
              placeholder="例: 不参加, 欠席"
            />
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>
              ここに含まれない値（例: 講演会のみ参加, 懇親会のみ参加）は参加として登録され、区分が備考に記録されます。
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
          <button className="btn btn-primary" onClick={handleSaveMapping} disabled={saving}>
            {saving ? '保存中...' : 'マッピングを保存'}
          </button>
          <button className="btn btn-secondary" onClick={() => setStep(config ? 'ready' : 'nolink')}>
            キャンセル
          </button>
        </div>
      </div>
    );
  }

  // --- 連携済み状態 ---
  function renderReady() {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name="link" size={14} /> 連携中
          </span>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            シート: {config.sheetName}
          </span>
        </div>
        <button className="btn btn-primary" onClick={handlePreview} disabled={previewing}>
          <Icon name="download" size={16} />
          {previewing ? '読み込み中...' : 'フォームから取り込み'}
        </button>
      </div>
    );
  }

  // --- プレビュー ---
  function renderPreview() {
    if (!preview) return null;

    const matched = preview.entries.filter(e => e.matched && !e.alreadyRegistered);
    const alreadyReg = preview.entries.filter(e => e.alreadyRegistered);
    const unmatched = preview.entries.filter(e => !e.matched);

    // 重複グループを構築
    const dupGroups = {};
    preview.entries.forEach(e => {
      if (e.duplicateGroup) {
        if (!dupGroups[e.duplicateGroup]) dupGroups[e.duplicateGroup] = [];
        dupGroups[e.duplicateGroup].push(e);
      }
    });
    const hasDuplicates = Object.keys(dupGroups).length > 0;

    // 重複でないか、重複グループで選択された方のみ表示
    const uniqueMatched = matched.filter(e =>
      !e.duplicateGroup || dupSelection[e.duplicateGroup] === e.formRow
    );
    const uniqueUnmatched = unmatched.filter(e =>
      !e.duplicateGroup || dupSelection[e.duplicateGroup] === e.formRow
    );

    const withDiffs = uniqueMatched.filter(e => e.diffs.length > 0);
    const checkedMatched = uniqueMatched.filter(e => matchedChecked.has(e.formRow));

    return (
      <div className="form-preview">
        {/* サマリー */}
        <div className="preview-summary">
          <div className="summary-item">
            <span className="summary-count">{checkedMatched.length}</span>
            <span>名登録対象</span>
          </div>
          <div className="summary-item">
            <span className="summary-count">{newMemberChecked.size}</span>
            <span>名新規追加</span>
          </div>
          <div className="summary-item">
            <span className="summary-count">{alreadyReg.length}</span>
            <span>名登録済み</span>
          </div>
          <div className="summary-item">
            <span className="summary-count">{preview.skipCount}</span>
            <span>名不参加</span>
          </div>
          {hasDuplicates && (
            <div className="summary-item">
              <span className="summary-count">{Object.keys(dupGroups).length}</span>
              <span>名重複</span>
            </div>
          )}
        </div>

        {/* 重複回答の選択 */}
        {hasDuplicates && (
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-sm)', color: 'var(--color-warning)' }}>
              <Icon name="content_copy" size={16} /> 重複回答（{Object.keys(dupGroups).length}名）
            </h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)' }}>
              同一人物の複数回答があります。採用する回答を選択してください（デフォルト: 最新の回答）。
            </p>
            {Object.entries(dupGroups).map(([group, groupEntries]) => (
              <div key={group} className="diff-card" style={{ marginBottom: 'var(--space-sm)' }}>
                <div className="diff-card-header">{groupEntries[0].formName}（{groupEntries.length}件）</div>
                <div style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                  {groupEntries.map(e => (
                    <label key={e.formRow} className="diff-option" style={{ display: 'flex', gap: 'var(--space-sm)', padding: '4px 0', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`dup-${group}`}
                        checked={dupSelection[group] === e.formRow}
                        onChange={() => {
                          setDupSelection(prev => ({ ...prev, [group]: e.formRow }));
                          // チェック状態も切り替え
                          setMatchedChecked(prev => {
                            const next = new Set(prev);
                            groupEntries.forEach(ge => next.delete(ge.formRow));
                            next.add(e.formRow);
                            return next;
                          });
                        }}
                      />
                      <span style={{ fontSize: 'var(--font-size-sm)' }}>
                        行{e.formRow}
                        {e.participationType && ` (${e.participationType})`}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 照合済み一覧（チェックで登録/除外） */}
        {uniqueMatched.length > 0 && (
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-sm)' }}>
              <Icon name="people" size={16} /> 名簿と照合済み（{uniqueMatched.length}名）
            </h3>
            <div className="bulk-list" style={{ maxHeight: 200 }}>
              <label className="bulk-check-item" style={{ fontWeight: 600, borderBottom: '1px solid var(--color-border)' }}>
                <input
                  type="checkbox"
                  checked={uniqueMatched.length > 0 && uniqueMatched.every(e => matchedChecked.has(e.formRow))}
                  onChange={() => {
                    const allChecked = uniqueMatched.every(e => matchedChecked.has(e.formRow));
                    setMatchedChecked(prev => {
                      const next = new Set(prev);
                      uniqueMatched.forEach(e => allChecked ? next.delete(e.formRow) : next.add(e.formRow));
                      return next;
                    });
                  }}
                />
                <span>全員選択</span>
              </label>
              {uniqueMatched.map(e => (
                <label key={e.formRow} className="bulk-check-item">
                  <input
                    type="checkbox"
                    checked={matchedChecked.has(e.formRow)}
                    onChange={() => {
                      setMatchedChecked(prev => {
                        const next = new Set(prev);
                        if (next.has(e.formRow)) next.delete(e.formRow);
                        else next.add(e.formRow);
                        return next;
                      });
                    }}
                  />
                  <span>{e.memberName}</span>
                  {e.participationType && <span className="badge badge-primary" style={{ fontSize: 'var(--font-size-xs)' }}>{e.participationType}</span>}
                  {e.diffs.length > 0 && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-warning)' }}>差異あり</span>}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* 差分解決 */}
        {withDiffs.length > 0 && withDiffs.some(e => matchedChecked.has(e.formRow)) && (
          <div className="diff-section">
            <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-sm)' }}>
              <Icon name="compare_arrows" size={16} /> 情報に差異がある会員（{withDiffs.length}名）
            </h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
              フォームの値と名簿の値が異なる項目です。どちらを採用するか選択してください。
            </p>
            {withDiffs.filter(e => matchedChecked.has(e.formRow)).map(entry => (
              <div key={entry.formRow} className="diff-card">
                <div className="diff-card-header">{entry.memberName}</div>
                {entry.diffs.map(diff => {
                  const resolution = diffResolutions[entry.formRow]?.[diff.field];
                  return (
                    <div key={diff.field} className="diff-row">
                      <span className="diff-field">{diff.field}</span>
                      <div className="diff-options">
                        <label className={`diff-option ${resolution?.source === 'form' ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name={`${entry.formRow}-${diff.field}`}
                            checked={resolution?.source === 'form'}
                            onChange={() => handleDiffChoice(entry.formRow, diff.field, 'form', diff.formValue)}
                          />
                          <span className="diff-label">フォーム:</span>
                          <span className="diff-value">{diff.formValue}</span>
                        </label>
                        <label className={`diff-option ${resolution?.source === 'member' ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name={`${entry.formRow}-${diff.field}`}
                            checked={resolution?.source === 'member'}
                            onChange={() => handleDiffChoice(entry.formRow, diff.field, 'member', diff.memberValue)}
                          />
                          <span className="diff-label">名簿:</span>
                          <span className="diff-value">{diff.memberValue}</span>
                        </label>
                        <div className={`diff-option diff-edit ${resolution?.source === 'edit' ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name={`${entry.formRow}-${diff.field}`}
                            checked={resolution?.source === 'edit'}
                            onChange={() => handleDiffEdit(entry.formRow, diff.field, resolution?.value || diff.formValue)}
                          />
                          <span className="diff-label">編集:</span>
                          <input
                            className="form-input diff-edit-input"
                            value={resolution?.source === 'edit' ? resolution.value : ''}
                            placeholder="自由入力..."
                            onFocus={() => {
                              if (resolution?.source !== 'edit') {
                                handleDiffEdit(entry.formRow, diff.field, diff.formValue);
                              }
                            }}
                            onChange={e => handleDiffEdit(entry.formRow, diff.field, e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* 未照合一覧 → 名簿に新規追加 */}
        {uniqueUnmatched.length > 0 && (
          <div style={{ marginTop: 'var(--space-md)' }}>
            <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-sm)', color: 'var(--color-warning)' }}>
              <Icon name="person_add" size={16} /> 名簿に見つからなかった回答（{uniqueUnmatched.length}件）
            </h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)' }}>
              チェックを入れると会員名簿に新規追加し、出席登録します。
            </p>
            {uniqueUnmatched.map(e => {
              const checked = newMemberChecked.has(e.formRow);
              const edits = newMemberEdits[e.formRow] || {};
              return (
                <div key={e.formRow} className="diff-card" style={{ opacity: checked ? 1 : 0.6 }}>
                  <label className="diff-card-header" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setNewMemberChecked(prev => {
                          const next = new Set(prev);
                          if (next.has(e.formRow)) next.delete(e.formRow);
                          else next.add(e.formRow);
                          return next;
                        });
                      }}
                      style={{ width: 18, height: 18, accentColor: 'var(--color-primary)' }}
                    />
                    <span>{e.formName || '(名前なし)'}</span>
                    {e.participationType && <span className="badge badge-primary" style={{ fontSize: 'var(--font-size-xs)' }}>{e.participationType}</span>}
                  </label>
                  {checked && Object.keys(e.mappedFormData).length > 0 && (
                    <div style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                      {Object.entries(e.mappedFormData).map(([field, value]) => (
                        <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 4, fontSize: 'var(--font-size-sm)' }}>
                          <span style={{ minWidth: 100, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>{field}</span>
                          <input
                            className="form-input"
                            style={{ padding: '2px 6px', fontSize: 'var(--font-size-sm)' }}
                            value={edits[field] !== undefined ? edits[field] : value}
                            onChange={ev => setNewMemberEdits(prev => ({
                              ...prev,
                              [e.formRow]: { ...(prev[e.formRow] || {}), [field]: ev.target.value },
                            }))}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 登録済み一覧 */}
        {alreadyReg.length > 0 && (
          <div style={{ marginTop: 'var(--space-md)' }}>
            <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-sm)', color: 'var(--color-text-muted)' }}>
              <Icon name="check" size={16} /> 既に登録済み（{alreadyReg.length}名 - スキップ）
            </h3>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
              {alreadyReg.map(e => <span key={e.formRow} style={{ marginRight: 'var(--space-sm)' }}>{e.memberName}</span>)}
            </div>
          </div>
        )}

        {/* 実行ボタン */}
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-lg)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--color-border-light)' }}>
          <button
            className="btn btn-primary"
            onClick={handleExecute}
            disabled={executing || (matched.length === 0 && newMemberChecked.size === 0)}
          >
            <Icon name="check_circle" size={16} />
            {executing ? '登録中...' : `${matched.length + newMemberChecked.size}名を登録する${newMemberChecked.size > 0 ? `（新規${newMemberChecked.size}名含む）` : ''}`}
          </button>
          <button className="btn btn-secondary" onClick={() => setStep('ready')}>
            キャンセル
          </button>
        </div>
      </div>
    );
  }
}
