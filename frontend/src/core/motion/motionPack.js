/* 动效包注册表与当前包。
 * 当前包 id 写在 <html data-motion>，各包的 CSS（themes/motion/*.css）按它生效；
 * JS 侧经 useMotion() 订阅，切包时所有动效组件一起换。 */
import letterpress from './packs/letterpress.js';
import liquid from './packs/liquid.js';
import signal from './packs/signal.js';

export const MOTION_PACKS = { [signal.id]: signal, [liquid.id]: liquid, [letterpress.id]: letterpress };
export const DEFAULT_MOTION_PACK_ID = liquid.id;

let current = MOTION_PACKS[DEFAULT_MOTION_PACK_ID];
const listeners = new Set();

function applyToDocument(id) {
  if (typeof document !== 'undefined') document.documentElement.dataset.motion = id;
}

applyToDocument(current.id);

export function getMotionPack() {
  return current;
}

// 未知 id 回落默认包
export function setMotionPack(id) {
  const next = MOTION_PACKS[id] ?? MOTION_PACKS[DEFAULT_MOTION_PACK_ID];
  if (next === current) return;
  current = next;
  applyToDocument(next.id);
  for (const listener of listeners) listener();
}

export function subscribeMotionPack(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
