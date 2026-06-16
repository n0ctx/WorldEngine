import { motion, useReducedMotion } from 'framer-motion';
import Icon from './Icon.jsx';

const TYPE_META = {
  error: { color: 'var(--we-color-status-danger)', seal: '驳' },
  warning: { color: 'var(--we-color-status-warning)', seal: '警' },
  info: { color: 'var(--we-color-status-info)', seal: '录' },
  success: { color: 'var(--we-color-accent)', seal: '成' },
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
      className="we-toast-card"
      style={{ '--toast-color': meta.color }}
    >
      <div className="we-toast-card__row">
        <span className="we-toast-card__seal" aria-hidden>
          {meta.seal}
        </span>
        <div className="we-toast-card__body">
          {toast.title ? (
            <div className="we-toast-card__title">{toast.title}</div>
          ) : null}
          <div className="we-toast-card__message">{toast.message}</div>
        </div>
        <button
          type="button"
          aria-label="关闭通知"
          onClick={onClose}
          className="we-toast-card__close"
        >
          <Icon size={16}>{CLOSE_PATHS}</Icon>
        </button>
      </div>
    </motion.div>
  );
}
