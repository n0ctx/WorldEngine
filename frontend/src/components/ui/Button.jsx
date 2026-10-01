import { motion } from 'framer-motion';
import { useTouchFx } from '../motion/useTouchFx.jsx';
import { useMotion } from '../../core/hooks/useMotion.js';

const sizeCls = {
  sm: 'we-btn-sm',
  md: '',
  lg: 'we-btn-lg',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  onPointerDown,
  children,
  ...props
}) {
  const m = useMotion();
  const touch = useTouchFx({ onPointerDown });
  return (
    <motion.button
      disabled={disabled}
      className={[
        'we-btn',
        `we-btn-${variant}`,
        sizeCls[size] ?? '',
        className,
      ].filter(Boolean).join(' ')}
      {...(variant === 'text' ? {} : m.gesture('press', { disabled }))}
      onPointerDown={variant === 'text' ? onPointerDown : touch.handlers.onPointerDown}
      {...props}
    >
      {children}
      {touch.fx}
    </motion.button>
  );
}
