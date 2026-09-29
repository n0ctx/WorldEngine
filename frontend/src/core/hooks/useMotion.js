import { useSyncExternalStore } from 'react';
import { useReducedMotion } from 'framer-motion';
import { transitions as sharedTransitions } from '../utils/motion.js';
import { getMotionPack, subscribeMotionPack } from '../motion/motionPack.js';

const MOTION_KEYS = ['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotate', 'filter'];
const INSTANT = { duration: 0 };

// reduced 模式：去掉位移 / 缩放 / 模糊，关键帧只留终值，过渡瞬间完成
function stripMotion(state) {
  if (typeof state === 'function') return (...args) => stripMotion(state(...args));
  if (!state || typeof state !== 'object') return state;
  const next = { ...state };
  for (const key of MOTION_KEYS) delete next[key];
  if (Array.isArray(next.opacity)) next.opacity = next.opacity[next.opacity.length - 1];
  if (next.transition) next.transition = { ...next.transition, duration: 0, delay: 0 };
  return next;
}

const cssMs = (seconds) => `${Math.round(seconds * 1000)}ms`;
// 包的时长以 CSS 变量交给 themes/motion/*.css 的关键帧；按包缓存，引用恒定
const cssVarsCache = new WeakMap();
function cssVarsOf(pack) {
  let vars = cssVarsCache.get(pack);
  if (!vars) {
    vars = {
      stream: {
        '--we-stream-char-duration':      cssMs(pack.stream.char),
        '--we-stream-caret-duration':     cssMs(pack.stream.caret),
        '--we-stream-caret-out-duration': cssMs(pack.stream.caretOut),
      },
      fx: {
        '--we-fx-burst':  cssMs(pack.fx.burst),
        '--we-fx-decode': cssMs(pack.fx.decode),
        '--we-fx-off':    cssMs(pack.fx.off),
        '--we-fx-stamp':  cssMs(pack.fx.stamp),
      },
    };
    cssVarsCache.set(pack, vars);
  }
  return vars;
}

export function useMotion() {
  const reduced = !!useReducedMotion();
  const pack = useSyncExternalStore(subscribeMotionPack, getMotionPack);

  return {
    reduced,
    pack,
    duration: (d) => (reduced ? 0 : d),
    ease:     (e) => (reduced ? 'linear' : e),
    // 先找当前包的预设（enter / exit / overlay / backdrop / move / press），再找共用预设；
    // reduced 模式下 duration → 0
    transition: (preset, { delay = 0 } = {}) => {
      const t = pack.transitions[preset] ?? sharedTransitions[preset] ?? sharedTransitions.ink;
      if (reduced) return { ...t, duration: 0, delay: 0 };
      return delay ? { ...t, delay } : t;
    },
    // 位移、尺寸、形状变化：名义时长交给当前包决定节奏
    flow: (duration, extra) => (reduced ? INSTANT : { ...pack.flow(duration), ...extra }),
    // 手势 props（whileHover / whileTap / transition），可直接展开到 motion 元素上；
    // disabled 时只保留 transition，让按下后立刻变禁用的按钮（如发送）也能复原；reduced 模式下不返回任何手势
    gesture: (key, { disabled = false } = {}) => {
      if (reduced) return {};
      return disabled ? { transition: pack.transitions.press } : { ...pack.gestures[key], transition: pack.transitions.press };
    },
    // 流式输出的 CSS 变量；reduced 模式下返回 null：新文字直接显示，光标静止，结束直接移除
    stream: () => (reduced ? null : cssVarsOf(pack).stream),
    // 世界被改写时的特效 CSS 变量；reduced 模式下返回 null：调用方不播放，只保留静态结果
    fx: () => (reduced ? null : cssVarsOf(pack).fx),
    // variants 预设；reduced 模式下去掉位移 / 缩放 / 模糊，关键帧只留终值
    variant: (key) => {
      const v = pack.variants[key];
      if (!reduced || !v) return v;
      return Object.fromEntries(Object.entries(v).map(([state, value]) => [state, stripMotion(value)]));
    },
  };
}
