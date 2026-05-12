import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DURATION, EASE } from '../../utils/motion.js';

const MotionDiv = motion.div;

// trigger: 数字，每次+1触发一次动画；或 visible: boolean（兼容两种用法）
export default function SealStampAnimation({ visible, trigger, text = '成' }) {
  const [showing, setShowing] = useState(false);

  // trigger 模式：数字变化时触发
  // sealOut delay 0.65s + duration 0.38s = 1.03s，padding 至 1100ms
  useEffect(() => {
    if (!trigger) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- trigger starts a bounded stamp animation timer.
    setShowing(true);
    const t = setTimeout(() => setShowing(false), 1100);
    return () => clearTimeout(t);
  }, [trigger]);

  // visible 模式：boolean 变为 true 时触发
  useEffect(() => {
    if (!visible) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- visible starts a bounded stamp animation timer.
    setShowing(true);
    const t = setTimeout(() => setShowing(false), 1100);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <AnimatePresence>
      {showing && (
        <MotionDiv
          className="we-seal-stamp-animation"
          initial={{ scale: 1.25, opacity: 0, rotate: -4 }}
          animate={{ scale: 1,    opacity: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.92, transition: { duration: DURATION.medium, ease: EASE.retract, delay: 0.65 } }}
          transition={{ duration: DURATION.base, ease: EASE.quill }}
        >
          <svg viewBox="0 0 76 76" fill="none" className="we-seal-stamp-svg">
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
        </MotionDiv>
      )}
    </AnimatePresence>
  );
}
