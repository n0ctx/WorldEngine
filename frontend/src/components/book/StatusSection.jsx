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

// 加载骨架行
function SkeletonRows() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 2 }}>
      {[70, 55, 80].map((w, i) => (
        <div key={i} className="we-skel" style={{ height: 10, width: `${w}%` }} />
      ))}
    </div>
  );
}

export default function StatusSection({ title, rows, pinnedName, onReset, resetting, className }) {
  // rows === null  → 加载中
  // rows === []    → 已加载但无字段（只展示 pinnedName）
  // rows.length>0  → 正常渲染
  const isLoading = rows === null;
  const hasName = pinnedName != null && pinnedName !== '';
  const hasRows = Array.isArray(rows) && rows.length > 0;
  const isEmpty = !isLoading && !hasName && !hasRows;

  return (
    <div className={`we-state-section ${className || ''}`}>
      {/* 区块标题栏 */}
      <div className="we-state-section-title">
        <span className="we-section-label">{title}</span>
        <span className="we-section-rule" />
        {onReset && (
          <button
            className="we-state-section-reset"
            onClick={() => { if (!resetting) onReset(); }}
          >
            {resetting ? '…' : '重置'}
          </button>
        )}
      </div>

      {/* 内容 */}
      {isLoading && <SkeletonRows />}

      {isEmpty && (
        <p className="we-section-empty">暂无数据</p>
      )}

      {!isLoading && !isEmpty && (
        <div className="we-fields-list">
          {/* 置顶姓名行 */}
          {hasName && (
            <div className="we-status-field" style={{ animationDelay: '0ms' }}>
              <span className="we-status-key">姓名</span>
              <span className="we-status-dots" />
              <span className="we-status-value">{pinnedName}</span>
            </div>
          )}

          {/* 字段行 */}
          {rows?.map((row, i) => {
            const type = row.field_type ?? row.type;
            const display = parseValue(row.effective_value_json, type);
            const max = row.max_value ?? row.max ?? null;
            const isNumber = type === 'number';
            const numVal = isNumber && display != null ? parseFloat(display) : null;
            const pct = max != null && numVal != null ? Math.min(100, (numVal / max) * 100) : null;

            return (
              <div key={row.field_key} style={{ animationDelay: `${(i + (hasName ? 1 : 0)) * 40}ms` }}>
                <div className="we-status-field">
                  <span className="we-status-key">{row.label}</span>
                  <span className="we-status-dots" />
                  <span className={`we-status-value${display == null ? ' we-status-null' : ''}`}>
                    {display != null ? (
                      isNumber && max != null ? `${display} / ${max}` : display
                    ) : '—'}
                  </span>
                </div>
                {pct != null && (
                  <div className="we-status-bar">
                    <div className="we-status-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
