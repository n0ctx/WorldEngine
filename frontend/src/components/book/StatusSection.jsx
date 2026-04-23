import { useState } from 'react';
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

export default function StatusSection({
  title,
  rows,
  pinnedName,
  onReset,
  resetting,
  className,
  collapsible = false,
  defaultOpen = true,
}) {
  const [open, setOpen] = useState(defaultOpen);

  const isLoading = rows === null;
  const hasName = pinnedName != null && pinnedName !== '';
  const hasRows = Array.isArray(rows) && rows.length > 0;
  const isEmpty = !isLoading && !hasName && !hasRows;

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
            return (
              <div
                key={row.field_key}
                className="we-status-field"
                style={{ animationDelay: `${(i + (hasName ? 1 : 0)) * 45}ms` }}
              >
                <span className="we-status-key">{row.label}</span>
                <span className={`we-status-value${display == null ? ' we-status-null' : ''}`}>
                  {display != null ? (
                    isNumber && max != null ? `${display} / ${max}` : display
                  ) : '—'}
                </span>
                {pct != null && (
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
