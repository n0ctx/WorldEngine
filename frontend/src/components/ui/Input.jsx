import { clearTouchPoint, setTouchPoint } from '../motion/useTouchFx.jsx';

// 聚焦时动效包从按下的位置（--mx / --my）开始画描边；失焦清掉，键盘聚焦从左侧开始
// size：md 36 高、正文字号；sm 28 高、说明文字字号（编辑器里、表单行内）
export default function Input({ size = 'md', className = '', onPointerDown, onBlur, ...props }) {
  return (
    <input
      className={['we-input', size === 'sm' ? 'we-input-sm' : '', className].filter(Boolean).join(' ')}
      onPointerDown={(e) => { setTouchPoint(e); onPointerDown?.(e); }}
      onBlur={(e) => { clearTouchPoint(e); onBlur?.(e); }}
      {...props}
    />
  );
}
