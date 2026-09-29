import { motion } from 'framer-motion';
import Icon from './Icon.jsx';
import GlitchText from '../motion/GlitchText.jsx';
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
  const glitchVars = m.glitch();
  const glitchKey = glitchVars ? toast.id : null;

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
      className={`we-toast-card${glitchVars ? ' we-toast-card--glitch' : ''}`}
      style={{ '--glitch-tone': meta.tone, ...glitchVars }}
    >
      <div className="we-toast-card__row">
        <span className={`we-glitch-tag we-toast-card__tag${glitchVars ? ' we-glitch-tag--play' : ''}`}>
          <GlitchText text={meta.code} playKey={glitchKey} decode />
        </span>
        <div className="we-toast-card__body">
          {toast.title ? (
            <div className="we-toast-card__title"><GlitchText text={toast.title} playKey={glitchKey} decode /></div>
          ) : null}
          <div className="we-toast-card__message"><GlitchText text={toast.message} playKey={glitchKey} decode /></div>
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
