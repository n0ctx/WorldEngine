/**
 * 翻页条（受控组件）：只渲染按钮与页码，不维护自己的状态、不计算切片。
 * 由父组件注入 totalPages / currentPage / onChange；totalPages <= 1 时不渲染。
 * 当前嵌入 InputBox 顶部工具条，居中显示。
 */
export default function Pager({ totalPages, currentPage, onChange }) {
  if (!Number.isFinite(totalPages) || totalPages <= 1) return null;
  const lastIdx = totalPages - 1;
  const current = Math.min(Math.max(0, currentPage ?? 0), lastIdx);

  const go = (idx) => {
    if (idx < 0 || idx > lastIdx || idx === current) return;
    onChange?.(idx);
  };

  return (
    <div className="we-pager-bar we-pager-bar--inline">
      <button
        type="button"
        className="we-pager-btn"
        onClick={() => go(current - 1)}
        disabled={current <= 0}
        aria-label="上一页"
        title="上一页"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <span className="we-pager-label">
        <span className="we-pager-index">第 {current + 1} / {totalPages} 页</span>
      </span>
      <button
        type="button"
        className="we-pager-btn"
        onClick={() => go(current + 1)}
        disabled={current >= lastIdx}
        aria-label="下一页"
        title="下一页"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}
