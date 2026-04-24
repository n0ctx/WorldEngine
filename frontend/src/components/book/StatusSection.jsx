import { useState, useRef, useEffect } from 'react';
import Icon from '../ui/Icon.jsx';

function parseValue(effectiveValueJson, type) {
  if (effectiveValueJson == null) return null;
  try {
    const v = JSON.parse(effectiveValueJson);
    if (type === 'boolean') {
      return (v === true || v === 'true' || v === '1' || v === 1) ? '是' : '否';
    }
    if (type === 'list') {
      if (!Array.isArray(v) || v.length === 0) return null;
      return v.join('、');
    }
    return String(v);
  } catch {
    return String(effectiveValueJson);
  }
}

function parseRawValue(effectiveValueJson, type) {
  if (effectiveValueJson == null) return type === 'list' ? [] : '';
  try {
    const v = JSON.parse(effectiveValueJson);
    if (type === 'boolean') return v === true || v === 'true' || v === '1' || v === 1;
    if (type === 'list') return Array.isArray(v) ? v : [];
    return v ?? '';
  } catch {
    return effectiveValueJson ?? '';
  }
}

function SkeletonRows() {
  return (
    <div className="we-status-skeleton">
      {[60, 80, 45].map((w, i) => (
        <div key={i}>
          <div className="we-skel we-status-skeleton-key" />
          <div className="we-skel we-status-skeleton-value" style={{ '--skel-width': `${w}%` }} />
        </div>
      ))}
    </div>
  );
}

function Chevron({ open }) {
  return (
    <Icon
      size={16}
      viewBox="0 0 10 10"
      strokeWidth="2.5"
      className="we-status-chevron"
      style={{
        transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
      }}
    >
      <polyline points="2,3.5 5,6.5 8,3.5" />
    </Icon>
  );
}

/**
 * 单行内联编辑器
 * @param {{ row, onCommit, onCancel }} props
 *   onCommit(valueJson) — 保存
 *   onCancel() — 取消
 */
function InlineEditor({ row, onCommit, onCancel }) {
  const type = row.field_type ?? row.type;
  const rawInit = parseRawValue(row.effective_value_json, type);
  const [draft, setDraft] = useState(rawInit);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function commit(value) {
    let valueJson;
    if (type === 'boolean') {
      valueJson = JSON.stringify(!!value);
    } else if (type === 'number') {
      const num = parseFloat(value);
      valueJson = isFinite(num) ? JSON.stringify(num) : null;
    } else if (type === 'list') {
      const arr = String(value).split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
      valueJson = JSON.stringify(arr);
    } else {
      valueJson = value === '' ? null : JSON.stringify(String(value));
    }
    onCommit(valueJson);
  }

  function handleKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); commit(draft); }
    if (e.key === 'Escape') { onCancel(); }
  }

  if (type === 'boolean') {
    return (
      <input
        ref={inputRef}
        type="checkbox"
        checked={!!draft}
        onChange={(e) => { setDraft(e.target.checked); commit(e.target.checked); }}
        onBlur={() => commit(draft)}
        className="w-4 h-4"
        style={{ accentColor: 'var(--we-color-gold)' }}
      />
    );
  }

  if (type === 'enum') {
    const options = (() => {
      try { return JSON.parse(row.enum_options || '[]'); } catch { return []; }
    })();
    return (
      <select
        ref={inputRef}
        value={draft ?? ''}
        onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
        onBlur={() => commit(draft)}
        onKeyDown={handleKey}
        className="we-input we-status-inline-input"
      >
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  const displayDraft = type === 'list'
    ? (Array.isArray(draft) ? draft.join(', ') : String(draft ?? ''))
    : String(draft ?? '');

  return (
    <input
      ref={inputRef}
      type={type === 'number' ? 'number' : 'text'}
      value={displayDraft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(draft)}
      onKeyDown={handleKey}
      className="we-input we-status-inline-input"
      placeholder={type === 'list' ? '逗号分隔' : ''}
    />
  );
}

export default function StatusSection({
  title,
  rows,
  pinnedName,
  onReset,
  resetting,
  onSave,
  className,
  collapsible = false,
  defaultOpen = true,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [editingKey, setEditingKey] = useState(null);

  const isLoading = rows === null;
  const hasName = pinnedName != null && pinnedName !== '';
  const hasRows = Array.isArray(rows) && rows.length > 0;
  const isEmpty = !isLoading && !hasName && !hasRows;

  function handleCommit(row, valueJson) {
    const key = row.character_id ? `${row.character_id}:${row.field_key}` : row.field_key;
    setEditingKey(null);
    onSave?.(row.field_key, valueJson, row.character_id);
  }

  const body = (
    <>
      {isLoading && <SkeletonRows />}
      {isEmpty && <p className="we-section-empty">暂无数据</p>}
      {!isLoading && !isEmpty && (
        <div className="we-fields-list">
          {hasName && (
            <div className="we-status-field" style={{ animationDelay: '0ms' }}>
              <span className="we-status-key">姓名</span>
              <span className="we-status-value">{pinnedName}</span>
            </div>
          )}
          {rows?.map((row, i) => {
            const type = row.field_type ?? row.type;
            const display = parseValue(row.effective_value_json, type);
            const max = row.max_value ?? row.max ?? null;
            const isNumber = type === 'number';
            const numVal = isNumber && display != null ? parseFloat(display) : null;
            const pct = max != null && numVal != null ? Math.min(100, (numVal / max) * 100) : null;
            const isManual = row.update_mode === 'manual';
            const editKey = row.character_id ? `${row.character_id}:${row.field_key}` : row.field_key;
            const isEditing = editingKey === editKey;

            return (
              <div
                key={editKey}
                className="we-status-field"
                style={{ animationDelay: `${(i + (hasName ? 1 : 0)) * 45}ms` }}
              >
                <span className="we-status-key">{row.label}</span>
                {isEditing ? (
                  <InlineEditor
                    row={row}
                    onCommit={(vj) => handleCommit(row, vj)}
                    onCancel={() => setEditingKey(null)}
                  />
                ) : (
                  <span
                    className={`we-status-value${display == null ? ' we-status-null' : ''}${isManual && onSave ? ' we-status-editable' : ''}`}
                    onClick={isManual && onSave ? () => setEditingKey(editKey) : undefined}
                    title={isManual && onSave ? '点击编辑' : undefined}
                  >
                    {display != null ? (
                      isNumber && max != null ? `${display} / ${max}` : display
                    ) : (isManual && onSave ? '点击编辑' : '—')}
                  </span>
                )}
                {pct != null && !isEditing && (
                  <div className="we-status-bar">
                    <div className="we-status-bar-fill" style={{ '--status-pct': `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  const showTitle = title || collapsible || onReset;

  return (
    <div className={`we-state-section ${className || ''}`}>
      {showTitle && (
        <div
          className={`we-state-section-title${collapsible ? ' we-state-section-title--collapsible' : ''}`}
          onClick={collapsible ? () => setOpen((o) => !o) : undefined}
        >
          {collapsible && <Chevron open={open} />}
          <span className="we-section-label">{title}</span>
          <span className="we-section-rule" />
          {onReset && (
            <button
              className="we-state-section-reset"
              onClick={(e) => { e.stopPropagation(); if (!resetting) onReset(); }}
            >
              {resetting ? '…' : '重置'}
            </button>
          )}
        </div>
      )}

      {collapsible ? (
        <div className={`we-status-collapse${open ? ' we-status-collapse--open' : ''}`}>
          <div className="we-status-collapse-inner">
            {body}
          </div>
        </div>
      ) : body}
    </div>
  );
}
