import { ChevronLeft, ChevronRight } from 'lucide-react';
import ChangeText from '../motion/ChangeText.jsx';
import IconButton from '../ui/IconButton.jsx';

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
      <IconButton size="sm" variant="secondary" label="上一页" onClick={() => go(current - 1)} disabled={current <= 0}>
        <ChevronLeft size={16} />
      </IconButton>
      <span className="we-pager-label">
        <span className="we-pager-index">第 <ChangeText text={String(current + 1)} playKey={current} decode /> / <ChangeText text={String(totalPages)} playKey={totalPages} decode /> 页</span>
      </span>
      <IconButton size="sm" variant="secondary" label="下一页" onClick={() => go(current + 1)} disabled={current >= lastIdx}>
        <ChevronRight size={16} />
      </IconButton>
    </div>
  );
}
