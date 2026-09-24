import { ChevronLeft, ChevronRight } from 'lucide-react';
import AnimatedCounter from '../motion/AnimatedCounter.jsx';

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
        <ChevronLeft size={20} />
      </button>
      <span className="we-pager-label">
        <span className="we-pager-index">第 <AnimatedCounter value={current + 1} /> / <AnimatedCounter value={totalPages} /> 页</span>
      </span>
      <button
        type="button"
        className="we-pager-btn"
        onClick={() => go(current + 1)}
        disabled={current >= lastIdx}
        aria-label="下一页"
        title="下一页"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
