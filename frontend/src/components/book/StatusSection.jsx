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

export default function StatusSection({ title, rows, pinnedName, onReset, resetting, className }) {
  const hasName = pinnedName != null && pinnedName !== '';
  const hasRows = rows && rows.length > 0;

  return (
    <div className={`we-state-section ${className || ''}`}>
      <div className="we-state-section-title">
        <span>{title}</span>
        {onReset && (
          <button
            className="we-state-section-reset"
            onClick={() => { if (!resetting) onReset(); }}
          >
            {resetting ? '重置中…' : '重置'}
          </button>
        )}
      </div>

      {!hasName && !hasRows ? (
        <p style={{ fontSize: 11, color: 'var(--we-ink-faded)', fontStyle: 'italic', margin: 0 }}>暂无数据</p>
      ) : (
        <>
          {hasName && (
            <div className="we-status-field">
              <span className="we-status-key">姓名</span>
              <span className="we-status-value">{pinnedName}</span>
            </div>
          )}
          {rows?.map((row) => {
            const type = row.field_type ?? row.type;
            const display = parseValue(row.effective_value_json, type);
            const max = row.max_value ?? row.max ?? null;
            const isNumber = type === 'number';
            const numVal = isNumber && display != null ? parseFloat(display) : null;

            return (
              <div key={row.field_key}>
                <div className="we-status-field">
                  <span className="we-status-key">{row.label}</span>
                  <span className="we-status-value">
                    {display != null ? (
                      isNumber && max != null ? `${display} / ${max}` : display
                    ) : (
                      <span style={{ opacity: 0.3 }}>—</span>
                    )}
                  </span>
                </div>
                {isNumber && max != null && numVal != null && (
                  <div className="we-status-bar">
                    <div
                      className="we-status-bar-fill"
                      style={{ width: `${Math.min(100, (numVal / max) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
