/* 移植自 Rare UI delete-button — https://rareui.com
 * Copyright (c) 2026 Swami Malode，许可见同目录 RAREUI_LICENSE。
 * 原地确认删除：垃圾桶掀盖，右侧滑出确认 / 取消，不弹对话框。
 * 只用于删除单个对象；会连带删除其他数据的操作继续走 ConfirmModal。 */
import { useEffect, useRef, useState } from 'react';
import {
  animate,
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from 'framer-motion';
import { useMotion } from '../../core/hooks/useMotion.js';

const HINGE = '3px 6px';
const LID_OPEN = -35;
const WALL_TOP = 6;
const WALL_TOP_OPEN = 13.5;
const WALL_BASE = 20;

const TILE = 28;
const PANEL = 60;
const HOLD = { deleted: 1400, kept: 600 };

const EASE = [0.32, 0.72, 0, 1];
const EASE_LID = [0.34, 1.1, 0.64, 1];

const WIDTH = { duration: 0.62, ease: EASE };
const LID = { duration: 0.6, ease: EASE_LID };
const WALL = { duration: 0.56, ease: EASE };
const IN = { duration: 0.44, ease: EASE, delay: 0.14 };
const OUT = { duration: 0.3, ease: EASE };
const TAP = { duration: 0.2, ease: EASE };
const SWAP = { duration: 0.22, ease: EASE };
const SETTLE = { duration: 0.45, ease: EASE };
const PRESS = { type: 'spring', stiffness: 520, damping: 18, mass: 0.5 };
const INSTANT = { duration: 0 };

const ICON = {
  viewBox: '0 0 24 24',
  fill: 'none',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

const panelMotion = {
  hidden: { opacity: 0, x: -6, transition: OUT },
  shown: { opacity: 1, x: 0, transition: { ...IN, staggerChildren: 0.07 } },
};

const circleMotion = {
  hidden: { opacity: 0, scale: 0.9, transition: OUT },
  shown: { opacity: 1, scale: 1, transition: IN },
};

function Circle({ label, onClick, reduced, children }) {
  return (
    <motion.div className="we-delete-btn__slot" variants={reduced ? undefined : circleMotion}>
      <motion.button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        whileHover={reduced ? undefined : { scale: 1.03 }}
        whileTap={reduced ? undefined : { scale: 0.84 }}
        transition={PRESS}
        className="we-delete-btn__circle"
      >
        <svg {...ICON} width="12" height="12" stroke="currentColor" strokeWidth="3.5">
          {children}
        </svg>
      </motion.button>
    </motion.div>
  );
}

export default function DeleteButton({
  label = '删除',
  onConfirm,
  onCancel,
  disabled = false,
  className = '',
}) {
  const { reduced } = useMotion();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('idle');
  const trigger = useRef(null);
  const timing = (transition) => (reduced ? INSTANT : transition);

  const top = useMotionValue(WALL_TOP);
  const wall = useTransform(top, (y) => WALL_BASE - y);
  const bin = useMotionTemplate`M19 ${top}v${wall}a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V${top}`;
  const settle = useMotionValue(1);

  useEffect(() => {
    const walls = animate(top, open ? WALL_TOP_OPEN : WALL_TOP, reduced ? INSTANT : WALL);
    return () => walls.stop();
  }, [open, reduced, top]);

  useEffect(() => {
    if (status === 'idle') return undefined;
    const nudge = status === 'kept' && !reduced ? animate(settle, [1, 0.86, 1], SETTLE) : null;
    const done = setTimeout(() => setStatus('idle'), HOLD[status]);
    return () => {
      nudge?.stop();
      clearTimeout(done);
    };
  }, [status, reduced, settle]);

  const resolve = (next) => {
    setOpen(false);
    setStatus(next);
    trigger.current?.focus();
    (next === 'deleted' ? onConfirm : onCancel)?.();
  };

  return (
    <motion.div
      data-state={open ? 'open' : 'closed'}
      data-status={status}
      className={`we-delete-btn${className ? ` ${className}` : ''}`}
      animate={{ width: open ? TILE + PANEL : TILE }}
      transition={timing(WIDTH)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return;
        e.stopPropagation();
        resolve('kept');
      }}
    >
      <motion.button
        ref={trigger}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (open) return resolve('kept');
          setStatus('idle');
          setOpen(true);
        }}
        whileTap={reduced || disabled ? undefined : { scale: 0.94 }}
        transition={TAP}
        className="we-delete-btn__trigger"
      >
        <AnimatePresence mode="wait" initial={false}>
          {status === 'deleted' ? (
            <motion.svg
              key="done"
              {...ICON}
              width="16"
              height="16"
              stroke="currentColor"
              strokeWidth="2.5"
              className="we-delete-btn__done"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={timing(SWAP)}
            >
              <motion.path
                d="M4 12.5 9.5 18 20 7"
                initial={reduced ? undefined : { pathLength: 0 }}
                animate={reduced ? undefined : { pathLength: 1 }}
                transition={SETTLE}
              />
            </motion.svg>
          ) : (
            <motion.svg
              key="bin"
              {...ICON}
              width="16"
              height="16"
              stroke="currentColor"
              strokeWidth="2"
              style={{ scale: settle, overflow: 'visible' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={timing(SWAP)}
            >
              <motion.path d={bin} />
              <motion.g
                style={{ transformBox: 'view-box', transformOrigin: HINGE }}
                animate={{ rotate: open ? LID_OPEN : 0 }}
                transition={timing(LID)}
              >
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </motion.g>
            </motion.svg>
          )}
        </AnimatePresence>
      </motion.button>

      <span role="status" aria-live="polite" className="we-visually-hidden">
        {status === 'deleted' ? '已删除' : status === 'kept' ? '已取消' : ''}
      </span>

      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            style={{ width: PANEL }}
            className="we-delete-btn__panel"
            variants={reduced ? undefined : panelMotion}
            initial="hidden"
            animate="shown"
            exit="hidden"
          >
            <span aria-hidden className="we-delete-btn__notch" />
            <Circle label="确认删除" reduced={reduced} onClick={() => resolve('deleted')}>
              <path d="M4 12.5 9.5 18 20 7" className="we-delete-btn__confirm-mark" />
            </Circle>
            <Circle label="取消" reduced={reduced} onClick={() => resolve('kept')}>
              <path d="M6 6 18 18M18 6 6 18" />
            </Circle>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
