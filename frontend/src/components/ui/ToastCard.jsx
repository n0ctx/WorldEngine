import { motion, useReducedMotion } from 'framer-motion';
import Icon from './Icon.jsx';

const TYPE_META = {
  error: {
    color: 'var(--we-color-status-danger)',
    seal: '驳',
    iconPaths: (
      <>
        <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </>
    ),
  },
  warning: {
    color: 'var(--we-color-status-warning)',
    seal: '警',
    iconPaths: (
      <>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </>
    ),
  },
  info: {
    color: 'var(--we-color-status-info)',
    seal: '录',
    iconPaths: (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </>
    ),
  },
  success: {
    color: 'var(--we-color-accent)',
    seal: '成',
    iconPaths: (
      <>
        <polyline points="20 6 9 17 4 12" />
      </>
    ),
  },
};

const CLOSE_PATHS = (
  <>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </>
);

export default function ToastCard({ toast, onClose, onMouseEnter, onMouseLeave }) {
  const meta = TYPE_META[toast.type] || TYPE_META.info;
  const isAssertive = toast.type === 'error';
  const reduced = useReducedMotion();

  const motionProps = reduced
    ? {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0, transition: { duration: 0.18 } },
      transition: { duration: 0.2 },
    }
    : {
      initial: { opacity: 0, scale: 0.9, y: -8 },
      animate: { opacity: 1, scale: 1, y: 0 },
      exit: { opacity: 0, x: 24, scale: 0.96, transition: { duration: 0.18 } },
      transition: { type: 'spring', stiffness: 420, damping: 22, mass: 0.6 },
      whileHover: { scale: 1.01 },
    };

  return (
    <motion.div
      role={isAssertive ? 'alert' : 'status'}
      aria-live={isAssertive ? 'assertive' : 'polite'}
      {...motionProps}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="relative pointer-events-auto w-80 overflow-hidden rounded-[var(--we-radius-md)] pl-4 pr-3 py-2.5 bg-[var(--we-color-bg-canvas)] shadow-[0_0_0_1px_var(--we-color-border-subtle),0_4px_12px_rgba(0,0,0,0.08)] border-l-4 border-l-[var(--toast-color)]"
      style={{ '--toast-color': meta.color }}
    >
      <div className="flex items-start gap-2">
        <span className="text-[var(--toast-color)] mt-0.5" aria-hidden>
          <Icon size={16}>{meta.iconPaths}</Icon>
        </span>
        <div className="flex-1 min-w-0">
          {toast.title ? (
            <div className="[font-family:var(--we-font-serif)] text-[14px] leading-tight text-[var(--we-color-text-primary)]">
              {toast.title}
            </div>
          ) : null}
          <div className="text-[12.5px] leading-snug text-[var(--we-color-text-secondary)] break-words">
            {toast.message}
          </div>
        </div>
        <button
          type="button"
          aria-label="关闭通知"
          onClick={onClose}
          className="text-[var(--we-color-text-tertiary)] hover:text-[var(--we-color-text-primary)] -mt-1"
        >
          <Icon size={16}>{CLOSE_PATHS}</Icon>
        </button>
      </div>
      <span
        aria-hidden
        className="absolute -bottom-1 left-1 [font-family:var(--we-font-serif)] text-[20px] select-none pointer-events-none text-[var(--toast-color)] opacity-[0.18]"
      >
        {meta.seal}
      </span>
    </motion.div>
  );
}
