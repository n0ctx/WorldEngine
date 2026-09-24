import { motion } from 'framer-motion';
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
  children,
  ...props
}) {
  const m = useMotion();
  return (
    <motion.button
      disabled={disabled}
      className={[
        'we-btn',
        `we-btn-${variant}`,
        sizeCls[size] ?? '',
        className,
      ].filter(Boolean).join(' ')}
      {...m.gesture('press', { disabled })}
      {...props}
    >
      {children}
    </motion.button>
  );
}
