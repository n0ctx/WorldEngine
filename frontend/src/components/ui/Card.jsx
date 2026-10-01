import { useTouchFx } from '../motion/useTouchFx.jsx';
import { cardClassName } from './cardClassName.js';

/**
 * 卡片：三种表面 × 三档密度。
 * variant：raised 浮起卡（阴影，放可点的独立内容）/ outlined 描边行（编辑器与设置里一行一项）/ sunken 凹陷框（面板里再分一块，不可点）。
 * density：compact / default / spacious；compact 用小圆角。
 * interactive 加悬停与键盘焦点样式，浮起卡再交给动效包的触点光晕；selected 统一强调色描边加淡底。
 * 根元素不是 div 时用 as；只要类名（交给别的组件渲染）时用 cardClassName。
 */
export default function Card({
  as: Tag = 'div',
  variant = 'raised',
  density = 'default',
  interactive = false,
  selected = false,
  className = '',
  onPointerDown,
  onPointerMove,
  children,
  ...props
}) {
  const touch = useTouchFx({ onPointerDown, onPointerMove });
  const fx = interactive && variant === 'raised';
  return (
    <Tag
      className={cardClassName({ variant, density, interactive, selected, className })}
      {...(fx ? touch.handlers : { onPointerDown, onPointerMove })}
      {...props}
    >
      {children}
      {fx && touch.fx}
    </Tag>
  );
}
