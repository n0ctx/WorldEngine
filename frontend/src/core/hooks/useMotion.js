import { useReducedMotion } from 'framer-motion';
import {
  GESTURE,
  SPRING,
  STREAM,
  transitions as motionTransitions,
  variants as motionVariants,
} from '../utils/motion.js';

const REDUCED_INSTANT = { duration: 0 };
const MOTION_KEYS = ['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotate', 'filter'];

function stripMotion(state) {
  if (!state || typeof state !== 'object') return state;
  const next = { ...state };
  for (const key of MOTION_KEYS) delete next[key];
  return next;
}

const cssEase = (ease) => `cubic-bezier(${ease.join(', ')})`;
// 流式书写的时长 / 缓动以 CSS 变量交给 chat.css 的关键帧；模块级常量，引用恒定
const STREAM_VARS = {
  '--we-stream-char-duration':      `${Math.round(STREAM.char.duration * 1000)}ms`,
  '--we-stream-char-ease':          cssEase(STREAM.char.ease),
  '--we-stream-caret-duration':     `${Math.round(STREAM.caret.duration * 1000)}ms`,
  '--we-stream-caret-ease':         cssEase(STREAM.caret.ease),
  '--we-stream-caret-out-duration': `${Math.round(STREAM.caretOut.duration * 1000)}ms`,
  '--we-stream-caret-out-ease':     cssEase(STREAM.caretOut.ease),
};

export function useMotion() {
  const systemReduced = useReducedMotion();
  const reduced = !!systemReduced;

  return {
    reduced,
    duration: (d) => (reduced ? 0 : d),
    ease:     (e) => (reduced ? 'linear' : e),
    blur:     (b) => (reduced ? '0px' : b),
    // 接受 transitions 预设 key，reduced 模式下 duration → 0
    transition: (preset) => {
      const t = motionTransitions[preset] ?? motionTransitions.ink;
      return reduced ? { ...t, duration: 0 } : t;
    },
    // 命名弹簧；delay 同时作用于位移弹簧和透明度淡入；reduced 模式下瞬时落定，不回弹
    spring: (key, { delay = 0 } = {}) => {
      if (reduced) return REDUCED_INSTANT;
      const s = SPRING[key];
      return delay ? { ...s, delay, opacity: { ...s.opacity, delay } } : s;
    },
    // 手势 props（whileHover / whileTap / transition），可直接展开到 motion 元素上；
    // disabled 时只保留弹簧，让按下后立刻变禁用的按钮（如发送）仍能回弹落定；
    // reduced 模式下不返回任何手势，悬停与按压都不产生位移或缩放
    gesture: (key, { disabled = false } = {}) => {
      if (reduced) return {};
      return disabled ? { transition: SPRING[key] } : { ...GESTURE[key], transition: SPRING[key] };
    },
    // 跟随指针的光（显隐）用的弹簧；reduced 模式下返回 null，调用方不渲染跟随光
    follow: (key) => (reduced ? null : SPRING[key]),
    // 流式书写的 CSS 变量；reduced 模式下返回 null：新文字直接显示，光标静止，结束直接移除
    stream: () => (reduced ? null : STREAM_VARS),
    // variants 预设；reduced 模式下去掉位移 / 缩放 / 模糊，只保留透明度
    variant: (key) => {
      const v = motionVariants[key];
      if (!reduced || !v) return v;
      return Object.fromEntries(Object.entries(v).map(([state, value]) => [state, stripMotion(value)]));
    },
  };
}
