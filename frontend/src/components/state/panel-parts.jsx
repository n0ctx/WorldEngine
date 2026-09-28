import { AnimatePresence, motion } from 'framer-motion';
import { DURATION, EASE } from '../../core/utils/motion.js';

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

/** 状态整理中 / 已整理的浮层提示。两种模式的外观类名不同，由调用方传入 */
export function StateBusyOverlay({
  isUpdating,
  justChanged,
  overlayKey,
  overlayClassName,
  chipClassName,
  chipStyle,
  textClassName,
}) {
  return (
    <AnimatePresence>
      {(isUpdating || justChanged) && (
        <MotionDiv
          key={overlayKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION.base, ease: EASE.page }}
          className={overlayClassName}
        >
          <AnimatePresence mode="wait">
            <MotionDiv
              key={isUpdating ? 'updating' : 'done'}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: DURATION.base, ease: EASE.ink }}
              className={chipClassName}
              style={chipStyle}
            >
              <span className={textClassName}>{isUpdating ? '整理中' : '已整理'}</span>
            </MotionDiv>
          </AnimatePresence>
        </MotionDiv>
      )}
    </AnimatePresence>
  );
}
