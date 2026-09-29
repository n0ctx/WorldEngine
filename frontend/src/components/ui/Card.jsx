import { useTouchFx } from '../motion/useTouchFx.jsx';

const elevationCls = {
  flat:      'we-card-flat',
  contained: '',
  ring:      'we-card-ring',
  whisper:   'we-card-whisper',
};

export default function Card({
  elevation = 'contained',
  className = '',
  onPointerDown,
  onPointerMove,
  children,
  ...props
}) {
  const touch = useTouchFx({ onPointerDown, onPointerMove });
  return (
    <div
      className={[
        'we-card',
        elevationCls[elevation] ?? '',
        className,
      ].filter(Boolean).join(' ')}
      {...touch.handlers}
      {...props}
    >
      {children}
      {touch.fx}
    </div>
  );
}
