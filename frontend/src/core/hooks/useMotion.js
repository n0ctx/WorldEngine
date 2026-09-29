import { useReducedMotion } from 'framer-motion';
import {
  GESTURE,
  GLITCH,
  STREAM,
  transitions as motionTransitions,
  variants as motionVariants,
} from '../utils/motion.js';

const MOTION_KEYS = ['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotate', 'filter'];

// reduced 模式：去掉位移 / 缩放，闪烁关键帧只留终值
function stripMotion(state) {
  if (!state || typeof state !== 'object') return state;
  const next = { ...state };
  for (const key of MOTION_KEYS) delete next[key];
  if (Array.isArray(next.opacity)) next.opacity = next.opacity[next.opacity.length - 1];
  if (next.transition) next.transition = { ...next.transition, duration: 0 };
  return next;
}

const cssMs = (seconds) => `${Math.round(seconds * 1000)}ms`;
// 流式输出的时长以 CSS 变量交给 chat.css 的关键帧；模块级常量，引用恒定
const STREAM_VARS = {
  '--we-stream-char-duration':      cssMs(STREAM.char.duration),
  '--we-stream-rain-duration':      cssMs(STREAM.rain.duration),
  '--we-stream-trail-duration':     cssMs(STREAM.trail.duration),
  '--we-stream-caret-duration':     cssMs(STREAM.caret.duration),
  '--we-stream-caret-out-duration': cssMs(STREAM.caretOut.duration),
};
// 信号故障的时长同样以 CSS 变量交给 ui.css 的关键帧
const GLITCH_VARS = {
  '--we-glitch-burst': cssMs(GLITCH.burst),
  '--we-glitch-off':   cssMs(GLITCH.off),
  '--we-glitch-stamp': cssMs(GLITCH.stamp),
};

export function useMotion() {
  const systemReduced = useReducedMotion();
  const reduced = !!systemReduced;

  return {
    reduced,
    duration: (d) => (reduced ? 0 : d),
    ease:     (e) => (reduced ? 'linear' : e),
    // 接受 transitions 预设 key，reduced 模式下 duration → 0
    transition: (preset, { delay = 0 } = {}) => {
      const t = motionTransitions[preset] ?? motionTransitions.ink;
      if (reduced) return { ...t, duration: 0, delay: 0 };
      return delay ? { ...t, delay } : t;
    },
    // 手势 props（whileHover / whileTap / transition），可直接展开到 motion 元素上；
    // 按下瞬时到位、松开瞬时复原，不回弹；disabled 时只保留 transition，
    // 让按下后立刻变禁用的按钮（如发送）也能复原；reduced 模式下不返回任何手势
    gesture: (key, { disabled = false } = {}) => {
      if (reduced) return {};
      return disabled ? { transition: motionTransitions.press } : { ...GESTURE[key], transition: motionTransitions.press };
    },
    // 流式输出的 CSS 变量；reduced 模式下返回 null：新文字直接显示，光标静止，结束直接移除
    stream: () => (reduced ? null : STREAM_VARS),
    // 信号故障的 CSS 变量；reduced 模式下返回 null：调用方不播放故障，只保留静态结果
    glitch: () => (reduced ? null : GLITCH_VARS),
    // variants 预设；reduced 模式下去掉位移 / 缩放，闪烁只留终值
    variant: (key) => {
      const v = motionVariants[key];
      if (!reduced || !v) return v;
      return Object.fromEntries(Object.entries(v).map(([state, value]) => [state, stripMotion(value)]));
    },
  };
}
