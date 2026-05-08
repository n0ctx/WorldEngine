import { useState, useRef, useEffect } from 'react';

/**
 * StatusTable — 在右侧状态栏渲染 2 行 N 列的表格状态字段。
 * 第 1 行：列表头（label）；第 2 行：数值；可选 min/max 时下方画进度条。
 *
 * Props:
 *   columns       — [{ key, label, min?, max? }]
 *   values        — { [colKey]: number | null | undefined }
 *   editable      — boolean，是否允许点击单元格进入编辑
 *   onCellCommit(colKey, num | null) — 单元格保存回调
 */
export default function StatusTable({ columns, values, editable, onCellCommit }) {
  const safeColumns = Array.isArray(columns) ? columns : [];
  const safeValues = (values && typeof values === 'object') ? values : {};
  const [editingKey, setEditingKey] = useState(null);

  if (safeColumns.length === 0) return null;

  return (
    <div
      className="we-status-table"
      style={{ '--we-status-table-cols': safeColumns.length }}
      role="table"
      aria-label="表格状态"
    >
      <div className="we-status-table-row we-status-table-head" role="row">
        {safeColumns.map((col) => (
          <span key={col.key} className="we-status-table-cell we-status-table-head-cell" role="columnheader">
            {col.label || col.key}
          </span>
        ))}
      </div>
      <div className="we-status-table-row we-status-table-body" role="row">
        {safeColumns.map((col) => {
          const raw = safeValues[col.key];
          const num = (raw == null || raw === '') ? null : Number(raw);
          const hasNum = num != null && isFinite(num);
          const isEditing = editingKey === col.key;
          const lo = col.min;
          const hi = col.max;
          const pct = hasNum && lo != null && hi != null && hi > lo
            ? Math.max(0, Math.min(100, ((num - lo) / (hi - lo)) * 100))
            : null;

          return (
            <span key={col.key} className="we-status-table-cell we-status-table-body-cell" role="cell">
              {isEditing ? (
                <CellEditor
                  initial={hasNum ? num : ''}
                  min={lo}
                  max={hi}
                  onCommit={(v) => { setEditingKey(null); onCellCommit?.(col.key, v); }}
                  onCancel={() => setEditingKey(null)}
                />
              ) : (
                <span
                  className={`we-status-table-value${hasNum ? '' : ' we-status-null'}${editable ? ' we-status-editable' : ''}`}
                  onClick={editable ? () => setEditingKey(col.key) : undefined}
                  title={editable ? '点击编辑' : undefined}
                >
                  {hasNum ? num : (editable ? '—' : '—')}
                </span>
              )}
              {pct != null && !isEditing && (
                <div className="we-status-bar we-status-table-bar">
                  <div className="we-status-bar-fill" style={{ '--status-pct': `${pct}%` }} />
                </div>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function CellEditor({ initial, min, max, onCommit, onCancel }) {
  const [draft, setDraft] = useState(initial);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select?.(); }, []);

  function commit(value) {
    if (value === '' || value == null) { onCommit(null); return; }
    const num = Number(value);
    if (!isFinite(num)) { onCancel(); return; }
    onCommit(num);
  }

  return (
    <input
      ref={ref}
      type="number"
      value={draft}
      min={min ?? undefined}
      max={max ?? undefined}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(draft); }
        if (e.key === 'Escape') { onCancel(); }
      }}
      className="we-input we-status-inline-input we-status-table-input"
    />
  );
}
