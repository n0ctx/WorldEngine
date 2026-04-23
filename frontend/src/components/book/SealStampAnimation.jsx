import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DURATION, EASE } from '../../utils/motion.js';

// trigger: 数字，每次+1触发一次动画；或 visible: boolean（兼容两种用法）
export default function SealStampAnimation({ visible, trigger, text = '成' }) {
  const [showing, setShowing] = useState(false);

  // trigger 模式：数字变化时触发
  // sealOut delay 0.65s + duration 0.38s = 1.03s，padding 至 1100ms
  useEffect(() => {
    if (!trigger) return;
    setShowing(true);
    const t = setTimeout(() => setShowing(false), 1100);
    return () => clearTimeout(t);
  }, [trigger]);

  // visible 模式：boolean 变为 true 时触发
  useEffect(() => {
    if (!visible) return;
    setShowing(true);
    const t = setTimeout(() => setShowing(false), 1100);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <AnimatePresence>
      {showing && (
        <motion.div
          style={{
            position: 'fixed',
            right: 40,
            bottom: 40,
            zIndex: 500, // --we-z-tooltip
            pointerEvents: 'none',
          }}
          initial={{ scale: 1.25, opacity: 0, rotate: -4 }}
          animate={{ scale: 1,    opacity: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.92, transition: { duration: DURATION.medium, ease: EASE.retract, delay: 0.65 } }}
          transition={{ duration: DURATION.base, ease: EASE.quill }}
        >
          <svg viewBox="0 0 76 76" fill="none" style={{ width: 80, height: 80, filter: 'drop-shadow(0 2px 8px color-mix(in srgb, var(--we-color-accent) 30%, transparent))' }}>
            <rect x="4" y="4" width="68" height="68" rx="2"
              stroke="var(--we-vermilion)" strokeWidth="2.5" />
            <rect x="8.5" y="8.5" width="59" height="59" rx="1"
              stroke="var(--we-vermilion)" strokeWidth="0.8"
              strokeDasharray="3 2" opacity="0.6" />
            <text
              x="38" y="48"
              textAnchor="middle"
              fontFamily="ZCOOL XiaoWei, LXGW WenKai TC, serif"
              fontSize="28"
              fill="var(--we-vermilion)"
            >
              {text}
            </text>
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
