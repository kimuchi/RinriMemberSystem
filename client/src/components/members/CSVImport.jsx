import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import { useApp } from '../../App';
import Icon from '../Icon';

/**
 * CSVを解析する（クォート・改行対応）
 */
function parseCSV(text) {
  const rows = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const row = [];
    while (i < len) {
      let value = '';
      // クォートフィールド
      if (text[i] === '"') {
        i++;
        while (i < len) {
          if (text[i] === '"') {
            if (i + 1 < len && text[i + 1] === '"') {
              value += '"';
              i += 2;
            } else {
              i++; // closing quote
              break;
            }
          } else {
            value += text[i];
            i++;
          }
        }
      } else {
        // 非クォートフィールド
        while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          value += text[i];
          i++;
        }
      }
      row.push(value);
      if (i < len && text[i] === ',') {
        i++;
      } else {
        break;
      }
    }
    // 改行をスキップ
    if (i < len && text[i] === '\r') i++;
    if (i < len && text[i] === '\n') i++;
    rows.push(row);
  }

  if (rows.length < 2) return { headers: [], data: [] };

  const headers = rows[0];
  const data = rows.slice(1)
    .filter(row => row.some(cell => cell.trim() !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = (row[idx] || '').trim();
      });
      return obj;
    });

  return { headers, data };
}

export default function CSVImport({ onClose, onImported }) {
  const { toast } = useApp();

  // ステップ: upload | mapping | valueMapping | preview | executing
  const [step, setStep] = useState('upload');

  // CSV
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvData, setCsvData] = useState([]);
  const [fileName, setFileName] = useState('');

  // フィールド情報
  const [memberFields, setMemberFields] = useState([]);
  const [loadingFields, setLoadingFields] = useState(false);

  // マッピング
  const [fieldMap, setFieldMap] = useState({});
  const [nameField, setNameField] = useState('');

  // 値マッピング（select型フィールド用）
  const [valueMap, setValueMap] = useState({});
  const [valueMappingFields, setValueMappingFields] = useState([]);

  // プレビュー
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [matchedChecked, setMatchedChecked] = useState(new Set());
  const [newMemberChecked, setNewMemberChecked] = useState(new Set());
  const [newMemberEdits, setNewMemberEdits] = useState({});
  const [diffResolutions, setDiffResolutions] = useState({});
  const [dupSelection, setDupSelection] = useState({});
  const [adoptAllCsv, setAdoptAllCsv] = useState(false);

  // 実行
  const [executing, setExecuting] = useState(false);

  // --- CSV読み込み ---
  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { headers, data } = parseCSV(ev.target.result);
        if (headers.length === 0 || data.length === 0) {
          toast.error('CSVにデータがありません');
          return;
        }
        setCsvHeaders(headers);
        setCsvData(data);
        // 氏名フィールドを推測
        const namePatterns = ['氏名', '名前', 'お名前', '姓名', '会員名', 'name'];
        const guessed = headers.find(h => namePatterns.some(p => h.includes(p)));
        setNameField(guessed || headers[0]);
        // 自動マッピング
        loadFieldsAndAutoMap(headers);
      } catch (err) {
        toast.error('CSVの解析に失敗しました');
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function loadFieldsAndAutoMap(headers) {
    setLoadingFields(true);
    try {
      const res = await api.getImportFields();
      setMemberFields(res.fields);
      // 自動マッピング（名前が一致するもの）
      const autoMap = {};
      for (const h of headers) {
        const match = res.fields.find(f => f.name === h || h.includes(f.name) || f.name.includes(h));
        if (match) autoMap[h] = match.name;
      }
      setFieldMap(autoMap);
      setStep('mapping');
    } catch (err) {
      toast.error('フィールド情報の取得に失敗しました');
    } finally {
      setLoadingFields(false);
    }
  }

  // --- マッピング → 値マッピング ---
  function handleProceedToValueMapping() {
    if (!nameField) {
      toast.warning('氏名に対応するCSV列を選択してください');
      return;
    }

    // select型のフィールドでマッピングされたものを抽出
    const selectFields = [];
    for (const [csvCol, memberCol] of Object.entries(fieldMap)) {
      if (!memberCol || csvCol === nameField) continue;
      const fieldDef = memberFields.find(f => f.name === memberCol);
      if (fieldDef && fieldDef.type === 'select' && fieldDef.options.length > 0) {
        // CSVから固有値を抽出
        const uniqueValues = [...new Set(csvData.map(row => row[csvCol]).filter(Boolean))];
        if (uniqueValues.length > 0) {
          selectFields.push({
            csvCol,
            memberCol,
            options: fieldDef.options,
            csvValues: uniqueValues,
          });
        }
      }
    }

    if (selectFields.length > 0) {
      setValueMappingFields(selectFields);
      // 自動マッピング（完全一致）
      const autoValueMap = {};
      for (const sf of selectFields) {
        autoValueMap[sf.memberCol] = {};
        for (const csvVal of sf.csvValues) {
          const exact = sf.options.find(o => o === csvVal);
          if (exact) {
            autoValueMap[sf.memberCol][csvVal] = exact;
          }
        }
      }
      setValueMap(autoValueMap);
      setStep('valueMapping');
    } else {
      // 値マッピング不要 → プレビューへ
      handlePreview();
    }
  }

  // --- プレビュー ---
  async function handlePreview() {
    setPreviewing(true);
    setPreview(null);
    setDiffResolutions({});
    setMatchedChecked(new Set());
    setNewMemberChecked(new Set());
    setNewMemberEdits({});
    setDupSelection({});
    setAdoptAllCsv(false);
    try {
      const res = await api.previewCsvImport({
        rows: csvData,
        fieldMap,
        nameField,
        valueMap: Object.keys(valueMap).length > 0 ? valueMap : undefined,
      });
      setPreview(res);

      // デフォルトの差分解決: 名簿の値を維持
      const defaults = {};
      for (const entry of res.entries) {
        if (entry.diffs.length > 0 && entry.matched) {
          defaults[entry.rowIndex] = {};
          for (const diff of entry.diffs) {
            defaults[entry.rowIndex][diff.field] = { value: diff.memberValue, source: 'member' };
          }
        }
      }
      setDiffResolutions(defaults);

      // 重複のデフォルト選択（最後の回答）
      const dupDefaults = {};
      for (const entry of res.entries) {
        if (entry.duplicateGroup) {
          dupDefaults[entry.duplicateGroup] = entry.rowIndex;
        }
      }
      setDupSelection(dupDefaults);

      // 既存会員はデフォルトでチェック
      const checkedSet = new Set();
      for (const entry of res.entries) {
        if (entry.matched) {
          if (entry.duplicateGroup) {
            if (dupDefaults[entry.duplicateGroup] === entry.rowIndex) {
              checkedSet.add(entry.rowIndex);
            }
          } else {
            checkedSet.add(entry.rowIndex);
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

  function handleDiffChoice(rowIndex, field, source, value) {
    setAdoptAllCsv(false);
    setDiffResolutions(prev => ({
      ...prev,
      [rowIndex]: { ...prev[rowIndex], [field]: { value, source } },
    }));
  }

  function handleDiffEdit(rowIndex, field, value) {
    setAdoptAllCsv(false);
    setDiffResolutions(prev => ({
      ...prev,
      [rowIndex]: { ...prev[rowIndex], [field]: { value, source: 'edit' } },
    }));
  }

  // すべての差異項目を一括でCSV値（checked）または名簿値（unchecked）に設定
  function handleAdoptAllCsv(checked) {
    setAdoptAllCsv(checked);
    if (!preview) return;
    setDiffResolutions(prev => {
      const next = { ...prev };
      for (const entry of preview.entries) {
        if (!entry.matched || entry.diffs.length === 0) continue;
        next[entry.rowIndex] = { ...next[entry.rowIndex] };
        for (const diff of entry.diffs) {
          next[entry.rowIndex][diff.field] = checked
            ? { value: diff.csvValue, source: 'form' }
            : { value: diff.memberValue, source: 'member' };
        }
      }
      return next;
    });
  }

  // --- 実行 ---
  async function handleExecute() {
    if (!preview) return;

    // 重複フィルタ
    const uniqueMatched = preview.entries.filter(e =>
      e.matched && (!e.duplicateGroup || dupSelection[e.duplicateGroup] === e.rowIndex)
    );
    const uniqueUnmatched = preview.entries.filter(e =>
      !e.matched && (!e.duplicateGroup || dupSelection[e.duplicateGroup] === e.rowIndex)
    );

    const toUpdate = uniqueMatched.filter(e => matchedChecked.has(e.rowIndex));
    const toAddNew = uniqueUnmatched.filter(e => newMemberChecked.has(e.rowIndex));

    if (toUpdate.length === 0 && toAddNew.length === 0) {
      toast.warning('取り込む対象がありません');
      return;
    }

    setExecuting(true);
    try {
      const updates = toUpdate.map(e => {
        const fieldUpdates = {};
        const resolved = diffResolutions[e.rowIndex];
        if (resolved) {
          for (const [field, resolution] of Object.entries(resolved)) {
            if (resolution.source !== 'member') {
              fieldUpdates[field] = resolution.value;
            }
          }
        }
        return { memberId: e.memberId, updates: fieldUpdates };
      });

      const newMembers = toAddNew.map(e => {
        const edits = newMemberEdits[e.rowIndex] || {};
        const fields = { ...e.mappedData, ...edits };
        const name = edits['氏名'] || e.csvName;
        return { name, fields };
      });

      const res = await api.executeCsvImport(updates, newMembers);
      const msgs = [];
      if (res.newMemberCount > 0) msgs.push(`${res.newMemberCount}名を新規追加`);
      if (res.updatedCount > 0) msgs.push(`${res.updatedCount}名の情報を更新`);
      toast.success(msgs.join('、') + 'しました');
      if (onImported) onImported();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExecuting(false);
    }
  }

  // ==================== レンダリング ====================

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content csv-import-modal">
        <div className="modal-header">
          <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
            <Icon name="upload_file" size={20} /> CSVインポート
          </h2>
          <button className="btn-icon" onClick={onClose} title="閉じる">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* ステップインジケーター */}
          <div className="import-steps">
            <span className={`import-step ${step === 'upload' ? 'active' : (step !== 'upload' ? 'done' : '')}`}>1. ファイル選択</span>
            <span className={`import-step ${step === 'mapping' ? 'active' : (['valueMapping', 'preview'].includes(step) ? 'done' : '')}`}>2. 列マッピング</span>
            <span className={`import-step ${step === 'valueMapping' ? 'active' : (step === 'preview' ? 'done' : '')}`}>3. 値マッピング</span>
            <span className={`import-step ${step === 'preview' ? 'active' : ''}`}>4. プレビュー</span>
          </div>

          {step === 'upload' && renderUpload()}
          {step === 'mapping' && renderMapping()}
          {step === 'valueMapping' && renderValueMapping()}
          {step === 'preview' && renderPreview()}
        </div>
      </div>
    </div>
  );

  // --- ファイル選択 ---
  function renderUpload() {
    return (
      <div>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
          UTF-8エンコードのCSVファイルを選択してください。1行目がヘッダー行として使用されます。
        </p>
        <div className="csv-upload-area">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            id="csv-file-input"
            style={{ display: 'none' }}
          />
          <label htmlFor="csv-file-input" className="csv-upload-label">
            <Icon name="upload_file" size={40} />
            <span>CSVファイルを選択</span>
            {fileName && <span className="csv-filename">{fileName}</span>}
          </label>
        </div>
        {loadingFields && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-lg)' }}>
            <div className="spinner" />
          </div>
        )}
      </div>
    );
  }

  // --- 列マッピング ---
  function renderMapping() {
    return (
      <div className="form-mapping">
        <div style={{ marginBottom: 'var(--space-md)' }}>
          <span className="badge badge-primary" style={{ fontSize: 'var(--font-size-xs)' }}>
            {csvData.length}行のデータ
          </span>
        </div>

        {/* 氏名フィールド */}
        <div className="form-group">
          <label className="form-label">氏名に対応するCSV列 *（名簿との照合に使用）</label>
          <select className="form-select" value={nameField} onChange={e => setNameField(e.target.value)}>
            <option value="">-- 選択 --</option>
            {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>

        {/* フィールドマッピング */}
        <div className="form-group">
          <label className="form-label">フィールド対応（CSV列 → 会員名簿の列）</label>
          <div className="mapping-table">
            {csvHeaders.filter(h => h !== nameField).map(csvCol => (
              <div key={csvCol} className="mapping-row">
                <span className="mapping-form-col">{csvCol}</span>
                <Icon name="arrow_forward" size={16} style={{ color: 'var(--color-text-muted)' }} />
                <select
                  className="form-select mapping-member-col"
                  value={fieldMap[csvCol] || ''}
                  onChange={e => setFieldMap(prev => ({ ...prev, [csvCol]: e.target.value }))}
                >
                  <option value="">（スキップ）</option>
                  {memberFields.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* CSVプレビュー */}
        <div className="form-group">
          <label className="form-label">データプレビュー（先頭3行）</label>
          <div style={{ overflow: 'auto', maxHeight: 200 }}>
            <table className="data-table" style={{ fontSize: 'var(--font-size-xs)' }}>
              <thead>
                <tr>
                  {csvHeaders.map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {csvData.slice(0, 3).map((row, i) => (
                  <tr key={i}>
                    {csvHeaders.map(h => <td key={h}>{row[h]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
          <button className="btn btn-primary" onClick={handleProceedToValueMapping}>
            次へ
          </button>
          <button className="btn btn-secondary" onClick={() => { setStep('upload'); setCsvHeaders([]); setCsvData([]); setFileName(''); }}>
            戻る
          </button>
        </div>
      </div>
    );
  }

  // --- 値マッピング ---
  function renderValueMapping() {
    return (
      <div>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
          選択式フィールドについて、CSVの値をどの選択肢に対応させるか設定してください。
        </p>

        {valueMappingFields.map(sf => (
          <div key={sf.memberCol} className="card" style={{ marginBottom: 'var(--space-md)' }}>
            <div className="card-header">
              <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                {sf.memberCol}
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginLeft: 'var(--space-sm)' }}>
                  (CSV列: {sf.csvCol})
                </span>
              </h3>
            </div>
            <div className="card-body">
              <div className="mapping-table">
                {sf.csvValues.map(csvVal => (
                  <div key={csvVal} className="mapping-row">
                    <span className="mapping-form-col">
                      {csvVal}
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginLeft: 'var(--space-xs)' }}>
                        ({csvData.filter(r => r[sf.csvCol] === csvVal).length}件)
                      </span>
                    </span>
                    <Icon name="arrow_forward" size={16} style={{ color: 'var(--color-text-muted)' }} />
                    <select
                      className="form-select mapping-member-col"
                      value={(valueMap[sf.memberCol] || {})[csvVal] || ''}
                      onChange={e => setValueMap(prev => ({
                        ...prev,
                        [sf.memberCol]: { ...(prev[sf.memberCol] || {}), [csvVal]: e.target.value },
                      }))}
                    >
                      <option value="">（そのまま）</option>
                      {sf.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
          <button className="btn btn-primary" onClick={handlePreview} disabled={previewing}>
            {previewing ? 'プレビュー生成中...' : 'プレビュー'}
          </button>
          <button className="btn btn-secondary" onClick={() => setStep('mapping')}>
            戻る
          </button>
        </div>
      </div>
    );
  }

  // --- プレビュー ---
  function renderPreview() {
    if (!preview) return null;

    const matched = preview.entries.filter(e => e.matched);
    const unmatched = preview.entries.filter(e => !e.matched);

    // 重複グループ
    const dupGroups = {};
    preview.entries.forEach(e => {
      if (e.duplicateGroup) {
        if (!dupGroups[e.duplicateGroup]) dupGroups[e.duplicateGroup] = [];
        dupGroups[e.duplicateGroup].push(e);
      }
    });
    const hasDuplicates = Object.keys(dupGroups).length > 0;

    // 重複フィルタ
    const uniqueMatched = matched.filter(e =>
      !e.duplicateGroup || dupSelection[e.duplicateGroup] === e.rowIndex
    );
    const uniqueUnmatched = unmatched.filter(e =>
      !e.duplicateGroup || dupSelection[e.duplicateGroup] === e.rowIndex
    );
    const withDiffs = uniqueMatched.filter(e => e.diffs.length > 0);
    const checkedMatchedCount = uniqueMatched.filter(e => matchedChecked.has(e.rowIndex)).length;

    return (
      <div className="form-preview">
        {/* サマリー */}
        <div className="preview-summary">
          <div className="summary-item">
            <span className="summary-count">{uniqueMatched.length}</span>
            <span>名が名簿に一致</span>
          </div>
          <div className="summary-item">
            <span className="summary-count">{uniqueUnmatched.length}</span>
            <span>名が新規</span>
          </div>
          {withDiffs.length > 0 && (
            <div className="summary-item">
              <span className="summary-count">{withDiffs.length}</span>
              <span>名に差異あり</span>
            </div>
          )}
          {hasDuplicates && (
            <div className="summary-item">
              <span className="summary-count">{Object.keys(dupGroups).length}</span>
              <span>名が重複</span>
            </div>
          )}
        </div>

        {/* 重複回答 */}
        {hasDuplicates && (
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-sm)', color: 'var(--color-warning)' }}>
              <Icon name="content_copy" size={16} /> 重複データ（{Object.keys(dupGroups).length}名）
            </h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)' }}>
              同一名の行が複数あります。採用する行を選択してください（デフォルト: 最後の行）。
            </p>
            {Object.entries(dupGroups).map(([group, groupEntries]) => (
              <div key={group} className="diff-card" style={{ marginBottom: 'var(--space-sm)' }}>
                <div className="diff-card-header">{groupEntries[0].csvName}（{groupEntries.length}件）</div>
                <div style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                  {groupEntries.map(e => (
                    <label key={e.rowIndex} className="diff-option" style={{ display: 'flex', gap: 'var(--space-sm)', padding: '4px 0', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`dup-${group}`}
                        checked={dupSelection[group] === e.rowIndex}
                        onChange={() => {
                          setDupSelection(prev => ({ ...prev, [group]: e.rowIndex }));
                          setMatchedChecked(prev => {
                            const next = new Set(prev);
                            groupEntries.forEach(ge => next.delete(ge.rowIndex));
                            next.add(e.rowIndex);
                            return next;
                          });
                        }}
                      />
                      <span style={{ fontSize: 'var(--font-size-sm)' }}>
                        CSV行{e.rowIndex + 2}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 照合済み一覧 */}
        {uniqueMatched.length > 0 && (
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-sm)' }}>
              <Icon name="people" size={16} /> 名簿と照合済み（{uniqueMatched.length}名）
            </h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)' }}>
              チェックした会員の情報を更新します（差異がない場合は変更されません）。
            </p>
            <div className="bulk-list" style={{ maxHeight: 200 }}>
              <label className="bulk-check-item" style={{ fontWeight: 600, borderBottom: '1px solid var(--color-border)' }}>
                <input
                  type="checkbox"
                  checked={uniqueMatched.length > 0 && uniqueMatched.every(e => matchedChecked.has(e.rowIndex))}
                  onChange={() => {
                    const allChecked = uniqueMatched.every(e => matchedChecked.has(e.rowIndex));
                    setMatchedChecked(prev => {
                      const next = new Set(prev);
                      uniqueMatched.forEach(e => allChecked ? next.delete(e.rowIndex) : next.add(e.rowIndex));
                      return next;
                    });
                  }}
                />
                <span>全員選択</span>
              </label>
              {uniqueMatched.map(e => (
                <label key={e.rowIndex} className="bulk-check-item">
                  <input
                    type="checkbox"
                    checked={matchedChecked.has(e.rowIndex)}
                    onChange={() => {
                      setMatchedChecked(prev => {
                        const next = new Set(prev);
                        if (next.has(e.rowIndex)) next.delete(e.rowIndex); else next.add(e.rowIndex);
                        return next;
                      });
                    }}
                  />
                  <span>{e.memberName}</span>
                  {e.diffs.length > 0 && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-warning)' }}>差異あり</span>}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* 差分解決 */}
        {withDiffs.length > 0 && withDiffs.some(e => matchedChecked.has(e.rowIndex)) && (
          <div className="diff-section">
            <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-sm)' }}>
              <Icon name="compare_arrows" size={16} /> 情報に差異がある会員
            </h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)' }}>
              CSVの値と名簿の値が異なる項目です。どちらを採用するか選択してください。
            </p>
            <label
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
                marginBottom: 'var(--space-md)', padding: 'var(--space-sm) var(--space-md)',
                background: 'var(--color-primary-bg, #eff6ff)', borderRadius: 'var(--radius-md)',
                cursor: 'pointer', fontWeight: 600, fontSize: 'var(--font-size-sm)',
              }}
            >
              <input
                type="checkbox"
                checked={adoptAllCsv}
                onChange={e => handleAdoptAllCsv(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--color-primary)' }}
              />
              <span>すべてCSVの値を採用する（差異のある項目を一括でCSV側に切り替え）</span>
            </label>
            {withDiffs.filter(e => matchedChecked.has(e.rowIndex)).map(entry => (
              <div key={entry.rowIndex} className="diff-card">
                <div className="diff-card-header">{entry.memberName}</div>
                {entry.diffs.map(diff => {
                  const resolution = diffResolutions[entry.rowIndex]?.[diff.field];
                  return (
                    <div key={diff.field} className="diff-row">
                      <span className="diff-field">{diff.field}</span>
                      <div className="diff-options">
                        <label className={`diff-option ${resolution?.source === 'form' ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name={`${entry.rowIndex}-${diff.field}`}
                            checked={resolution?.source === 'form'}
                            onChange={() => handleDiffChoice(entry.rowIndex, diff.field, 'form', diff.csvValue)}
                          />
                          <span className="diff-label">CSV:</span>
                          <span className="diff-value">{diff.csvValue}</span>
                        </label>
                        <label className={`diff-option ${resolution?.source === 'member' ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name={`${entry.rowIndex}-${diff.field}`}
                            checked={resolution?.source === 'member'}
                            onChange={() => handleDiffChoice(entry.rowIndex, diff.field, 'member', diff.memberValue)}
                          />
                          <span className="diff-label">名簿:</span>
                          <span className="diff-value">{diff.memberValue}</span>
                        </label>
                        <div className={`diff-option diff-edit ${resolution?.source === 'edit' ? 'selected' : ''}`}>
                          <input
                            type="radio"
                            name={`${entry.rowIndex}-${diff.field}`}
                            checked={resolution?.source === 'edit'}
                            onChange={() => handleDiffEdit(entry.rowIndex, diff.field, resolution?.value || diff.csvValue)}
                          />
                          <span className="diff-label">編集:</span>
                          <input
                            className="form-input diff-edit-input"
                            value={resolution?.source === 'edit' ? resolution.value : ''}
                            placeholder="自由入力..."
                            onFocus={() => {
                              if (resolution?.source !== 'edit') handleDiffEdit(entry.rowIndex, diff.field, diff.csvValue);
                            }}
                            onChange={e => handleDiffEdit(entry.rowIndex, diff.field, e.target.value)}
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

        {/* 新規会員 */}
        {uniqueUnmatched.length > 0 && (
          <div style={{ marginTop: 'var(--space-md)' }}>
            <h3 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-sm)', color: 'var(--color-warning)' }}>
              <Icon name="person_add" size={16} /> 名簿に見つからなかった行（{uniqueUnmatched.length}件）
            </h3>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)' }}>
              チェックを入れると会員名簿に新規追加します。
            </p>
            <label className="bulk-check-item" style={{ fontWeight: 600, borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--space-xs)' }}>
              <input
                type="checkbox"
                checked={uniqueUnmatched.length > 0 && uniqueUnmatched.every(e => newMemberChecked.has(e.rowIndex))}
                onChange={() => {
                  const allChecked = uniqueUnmatched.every(e => newMemberChecked.has(e.rowIndex));
                  setNewMemberChecked(prev => {
                    const next = new Set(prev);
                    uniqueUnmatched.forEach(e => allChecked ? next.delete(e.rowIndex) : next.add(e.rowIndex));
                    return next;
                  });
                }}
              />
              <span>全員選択</span>
            </label>
            {uniqueUnmatched.map(e => {
              const checked = newMemberChecked.has(e.rowIndex);
              const edits = newMemberEdits[e.rowIndex] || {};
              return (
                <div key={e.rowIndex} className="diff-card" style={{ opacity: checked ? 1 : 0.6 }}>
                  <label className="diff-card-header" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setNewMemberChecked(prev => {
                          const next = new Set(prev);
                          if (next.has(e.rowIndex)) next.delete(e.rowIndex); else next.add(e.rowIndex);
                          return next;
                        });
                      }}
                      style={{ width: 18, height: 18, accentColor: 'var(--color-primary)' }}
                    />
                    <span>{e.csvName || '(名前なし)'}</span>
                  </label>
                  {checked && Object.keys(e.mappedData).length > 0 && (
                    <div style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                      {Object.entries(e.mappedData).filter(([f]) => f !== '氏名').map(([field, value]) => (
                        <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 4, fontSize: 'var(--font-size-sm)' }}>
                          <span style={{ minWidth: 100, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>{field}</span>
                          <input
                            className="form-input"
                            style={{ padding: '2px 6px', fontSize: 'var(--font-size-sm)' }}
                            value={edits[field] !== undefined ? edits[field] : value}
                            onChange={ev => setNewMemberEdits(prev => ({
                              ...prev,
                              [e.rowIndex]: { ...(prev[e.rowIndex] || {}), [field]: ev.target.value },
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

        {/* 実行ボタン */}
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-lg)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--color-border-light)' }}>
          <button
            className="btn btn-primary"
            onClick={handleExecute}
            disabled={executing}
          >
            <Icon name="check_circle" size={16} />
            {executing ? 'インポート中...' : `インポート実行（更新${checkedMatchedCount}名・新規${newMemberChecked.size}名）`}
          </button>
          <button className="btn btn-secondary" onClick={() => setStep(valueMappingFields.length > 0 ? 'valueMapping' : 'mapping')}>
            戻る
          </button>
        </div>
      </div>
    );
  }
}
