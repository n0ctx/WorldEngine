import Icon from './Icon.jsx';

/**
 * DragHandle — 列表项拖拽手柄图标（替代盲文字符 ⠿ 等 emoji-as-icon）。
 * 纯装饰触发器：默认 aria-hidden（排序语义由所在行的 dragHandleProps 承载）。
 * 定位与 hover 显隐由调用方的容器类（如 .we-char-drag）控制；颜色继承 currentColor。
 */
export default function DragHandle({ className }) {
  return (
    <Icon size={16} className={className}>
      <circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </Icon>
  );
}
