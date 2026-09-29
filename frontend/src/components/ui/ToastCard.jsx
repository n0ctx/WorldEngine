import { motion } from 'framer-motion';
import Icon from './Icon.jsx';
import ChangeText from '../motion/ChangeText.jsx';
import { useMotion } from '../../core/hooks/useMotion.js';

// 类型标签与状态栏的本轮变化标签同一种切角样式，颜色取对应状态色
const TYPE_META = {
  error: { tone: 'var(--we-color-status-danger)', code: '错误' },
  warning: { tone: 'var(--we-color-status-warning)', code: '警告' },
  info: { tone: 'var(--we-color-status-info)', code: '提示' },
  success: { tone: 'var(--we-color-status-success)', code: '完成' },
};

const CLOSE_PATHS = (
  <>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </>
);

// 提示条：信号锁定入场，内容行抖一下，类型标签被一块实色刷出，标签与正文从乱码解码
export default function ToastCard({ toast, onClose, onMouseEnter, onMouseLeave }) {
  const meta = TYPE_META[toast.type] || TYPE_META.info;
  const isAssertive = toast.type === 'error';
  const m = useMotion();
  const fxVars = m.fx();
  const fxKey = fxVars ? toast.id : null;

  return (
    <motion.div
      role={isAssertive ? 'alert' : 'status'}
      aria-live={isAssertive ? 'assertive' : 'polite'}
      variants={m.variant('overlayEnter')}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={m.transition('overlay')}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`we-toast-card${fxVars ? ' we-toast-card--fx' : ''}`}
      style={{ '--change-tone': meta.tone, ...fxVars }}
    >
      <div className="we-toast-card__row">
        <span className={`we-change-tag we-toast-card__tag${fxVars ? ' we-change-tag--play' : ''}`}>
          <ChangeText text={meta.code} playKey={fxKey} decode />
        </span>
        <div className="we-toast-card__body">
          {toast.title ? (
            <div className="we-toast-card__title"><ChangeText text={toast.title} playKey={fxKey} decode /></div>
          ) : null}
          <div className="we-toast-card__message"><ChangeText text={toast.message} playKey={fxKey} decode /></div>
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
