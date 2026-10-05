import { IconGrip } from './icons.jsx';

/**
 * DragHandle — 列表项拖拽手柄图标（替代盲文字符 ⠿ 等 emoji-as-icon）。
 * 纯装饰触发器：默认 aria-hidden（排序语义由所在行的 dragHandleProps 承载）。
 * 定位与悬停加深由调用方的容器类（如 .we-char-drag）控制；颜色继承 currentColor。
 */
export default function DragHandle({ className }) {
  return <IconGrip size={16} className={className} />;
}
