import { clearTouchPoint, setTouchPoint } from '../motion/useTouchFx.jsx';

// 聚焦时动效包从按下的位置（--mx / --my）开始画描边；失焦清掉，键盘聚焦从左侧开始
export default function Input({ className = '', onPointerDown, onBlur, ...props }) {
  return (
    <input
      className={['we-input', className].filter(Boolean).join(' ')}
      onPointerDown={(e) => { setTouchPoint(e); onPointerDown?.(e); }}
      onBlur={(e) => { clearTouchPoint(e); onBlur?.(e); }}
      {...props}
    />
  );
}
