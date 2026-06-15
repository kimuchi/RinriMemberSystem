import React, { useState, useEffect, useRef } from 'react';
import Icon from '../Icon';

/**
 * Excel風の列ヘッダー絞り込みポップオーバー
 * - 検索ボックスで値を絞り込み
 * - (すべて) チェックで一括ON/OFF
 * - 空欄も明示的に選択可能（"(空欄)" として表示）
 *
 * Props:
 *   anchor: 表示位置のアンカー要素（DOMRectを取得する）
 *   values: 全ユニーク値の配列（並び順をそのまま使う）
 *   selected: 選択中の Set。size===0 は未絞り込み（=すべて表示）
 *   onChange: 新しい Set を返す
 *   onClose: 閉じる
 */
export default function ColumnFilter({ anchor, values, selected, onChange, onClose }) {
  const [search, setSearch] = useState('');
  const popoverRef = useRef(null);
  const [pos, setPos] = useState(null);

  // アンカー位置から表示位置を決定
  useEffect(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPos({
      top: rect.bottom + window.scrollY + 4,
      left: Math.min(rect.left + window.scrollX, window.innerWidth - 280),
    });
  }, [anchor]);

  // 外側クリック / Esc で閉じる
  useEffect(() => {
    function handle(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) {
        onClose();
      }
    }
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handleKey);
    };
  }, [anchor, onClose]);

  const labelFor = v => v === '' ? '(空欄)' : v;
  const filtered = values.filter(v => !search || labelFor(v).toLowerCase().includes(search.toLowerCase()));

  // 「すべて選択」状態: selectedが空なら全選択扱い、または全値が含まれる
  const isAllMode = selected.size === 0;
  const isAllChecked = isAllMode || (values.length > 0 && values.every(v => selected.has(v)));

  function toggleValue(v) {
    let next;
    if (isAllMode) {
      // 「すべて」状態 → 個別チェックを開始するため、まず全部入れてからクリック分を外す
      next = new Set(values);
      next.delete(v);
    } else {
      next = new Set(selected);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      // 全部入った場合は「すべて」扱い（空Set）に戻す
      if (values.every(x => next.has(x))) next = new Set();
    }
    onChange(next);
  }

  function toggleAll() {
    if (isAllChecked) {
      // 全部外す（フィルタは「何も選択していない」状態 = 何も表示しない）
      // ただし UX的には「すべて」 = 何も絞らない、を優先したいので、
      // ここでは「すべて外す」を「フィルタを空に戻す = すべて表示」と解釈する
      onChange(new Set());
    } else {
      onChange(new Set()); // 空Set = すべて表示
    }
  }

  function clearAll() {
    onChange(new Set());
  }

  if (!pos) return null;

  return (
    <div
      ref={popoverRef}
      className="column-filter-popover"
      style={{ top: pos.top, left: pos.left }}
      onClick={e => e.stopPropagation()}
    >
      <div className="column-filter-search">
        <Icon name="search" size={14} />
        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="絞り込み..."
        />
      </div>
      <div className="column-filter-list">
        <label className="column-filter-item column-filter-all">
          <input
            type="checkbox"
            checked={isAllChecked}
            onChange={toggleAll}
          />
          <span>（すべて表示）</span>
        </label>
        {filtered.length === 0 && (
          <div className="column-filter-empty">該当なし</div>
        )}
        {filtered.map(v => (
          <label key={v || '__empty__'} className="column-filter-item">
            <input
              type="checkbox"
              checked={isAllMode ? true : selected.has(v)}
              onChange={() => toggleValue(v)}
            />
            <span>{v === '' ? <em style={{ color: 'var(--color-text-muted)' }}>(空欄)</em> : v}</span>
          </label>
        ))}
      </div>
      <div className="column-filter-footer">
        <button className="btn btn-secondary btn-sm" onClick={clearAll}>クリア</button>
        <button className="btn btn-primary btn-sm" onClick={onClose}>OK</button>
      </div>
    </div>
  );
}
