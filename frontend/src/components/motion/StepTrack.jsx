/* 移植自 Rare UI step-player — https://rareui.com
 * Copyright (c) 2026 Swami Malode，许可见同目录 RAREUI_LICENSE。
 * 分步进度条：每一步是一颗圆点，当前步拉长成条并从左向右填满，已走过的步加深。
 * 只保留进度轨道，去掉播放 / 暂停控件与自动计时。 */
import { motion } from 'framer-motion';
import { useMotion } from '../../core/hooks/useMotion.js';

const WIDTH_SPRING = { type: 'spring', duration: 0.42, bounce: 0.14 };
const INSTANT = { duration: 0 };

// 比例取自上游（对照 iOS 原型量出）
const RATIO = { dot: 0.115, barPerDot: 8.2, gap: 0.18 };

function metricsFor(size) {
  const track = Math.max(12, size);
  const dot = Math.max(2, Math.round(track * RATIO.dot));
  return {
    track,
    dot,
    bar: Math.round(dot * RATIO.barPerDot),
    gap: Math.max(2, Math.round(track * RATIO.gap)),
    pad: Math.round((track - dot) / 2),
  };
}

export default function StepTrack({ steps, current, size = 28 }) {
  const { reduced } = useMotion();
  const m = metricsFor(size);
  const transition = reduced ? INSTANT : WIDTH_SPRING;
  return (
    <div
      role="img"
      aria-label={`第 ${current + 1} / ${steps} 步`}
      className="we-step-track"
      style={{ height: m.track, paddingInline: m.pad, gap: m.gap }}
    >
      {Array.from({ length: steps }, (_, i) => {
        const state = i === current ? 'active' : i < current ? 'past' : 'pending';
        return (
          <motion.span
            key={i}
            data-state={state}
            className="we-step-track__step"
            initial={reduced ? false : { width: m.dot }}
            animate={{ width: state === 'active' ? m.bar : m.dot }}
            transition={transition}
            style={{ height: m.dot }}
          >
            {state === 'active' && (
              <motion.span
                className="we-step-track__fill"
                initial={{ scaleX: reduced ? 1 : 0 }}
                animate={{ scaleX: 1 }}
                transition={transition}
              />
            )}
          </motion.span>
        );
      })}
    </div>
  );
}
