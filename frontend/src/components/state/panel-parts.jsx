import { AnimatePresence, motion } from 'framer-motion';
import ChangeText from '../motion/ChangeText.jsx';
import { useMotion } from '../../core/hooks/useMotion.js';

const MotionDiv = motion.div;

export function RefreshIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <polyline points="21 4 21 10 15 10" />
    </svg>
  );
}

export function DiaryEntry({ entry, index, selected, onSelect, className, style }) {
  return (
    <div
      className={`we-timeline-entry ${className}${selected ? ` ${className}--selected` : ''}`}
      style={{ animationDelay: `${index * 50}ms`, ...style }}
      onClick={() => onSelect(entry)}
      title="点击注入下轮提示词"
    >
      <span className="we-timeline-dot">·</span>
      <span className="we-timeline-text">
        <em className="we-timeline-round">{entry.date_display}</em>
        {' '}{entry.summary}
      </span>
    </div>
  );
}

export function ResetAction({ onClick, busy }) {
  return (
    <button
      type="button"
      className="we-state-reset"
      onClick={(e) => { e.stopPropagation(); if (!busy) onClick(); }}
      disabled={busy}
      aria-label="重置本区状态"
      title="重置本区状态"
    >
      {busy ? '…' : (<><RefreshIcon /><span>重置</span></>)}
    </button>
  );
}

/** 状态整理中 / 已整理的浮层提示：扫描线遮罩 + 切角标签（文字乱码解码）。两种模式的外观类名不同，由调用方传入 */
export function StateBusyOverlay({
  isUpdating,
  justChanged,
  overlayKey,
  overlayClassName,
  chipClassName,
  chipStyle,
  textClassName,
}) {
  const m = useMotion();
  const label = isUpdating ? '整理中' : '已整理';
  const fxVars = m.fx();
  return (
    <AnimatePresence>
      {(isUpdating || justChanged) && (
        <MotionDiv
          key={overlayKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={m.transition('backdrop')}
          className={overlayClassName}
        >
          <AnimatePresence mode="wait">
            <MotionDiv
              key={label}
              variants={m.variant('enter')}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={m.transition('enter')}
              className={chipClassName}
              style={chipStyle}
            >
              <span
                className={`we-change-tag ${textClassName}${fxVars ? ' we-change-tag--play' : ''}`}
                style={fxVars ?? undefined}
              >
                <ChangeText text={label} playKey={fxVars ? label : null} decode />
              </span>
            </MotionDiv>
          </AnimatePresence>
        </MotionDiv>
      )}
    </AnimatePresence>
  );
}
