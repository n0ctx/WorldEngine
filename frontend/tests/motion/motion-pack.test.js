import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_MOTION_PACK_ID,
  MOTION_PACKS,
  getMotionPack,
  setMotionPack,
  subscribeMotionPack,
} from '../../src/core/motion/motionPack.js';
import signal from '../../src/core/motion/packs/signal.js';

const shape = (pack) => ({
  variants: Object.keys(pack.variants).sort(),
  variantStates: Object.fromEntries(Object.entries(pack.variants).map(([k, v]) => [k, Object.keys(v).sort()])),
  transitions: Object.keys(pack.transitions).sort(),
  gestures: Object.keys(pack.gestures).sort(),
  stream: Object.keys(pack.stream).sort(),
  fx: Object.keys(pack.fx).sort(),
});

describe('动效包', () => {
  afterEach(() => setMotionPack(DEFAULT_MOTION_PACK_ID));

  it('每个包提供同一套动效位，缺一个就失败', () => {
    const reference = shape(signal);
    for (const pack of Object.values(MOTION_PACKS)) {
      expect(shape(pack)).toEqual(reference);
      expect(typeof pack.flow).toBe('function');
      expect(pack.name).toBeTruthy();
    }
  });

  it('每个包的入场都落在静止态、离场落到透明', () => {
    for (const pack of Object.values(MOTION_PACKS)) {
      const { hidden, visible, exit } = pack.variants.enter;
      expect(hidden.opacity).toBe(0);
      expect([visible.opacity].flat().at(-1)).toBe(1);
      expect([visible.x ?? 0].flat().at(-1)).toBe(0);
      expect([visible.y ?? 0].flat().at(-1)).toBe(0);
      expect([exit.opacity].flat().at(-1)).toBe(0);
    }
  });

  it('手势只含目标值不含 transition，按下是压缩或陷落', () => {
    for (const pack of Object.values(MOTION_PACKS)) {
      for (const gesture of Object.values(pack.gestures)) expect(gesture.transition).toBeUndefined();
      const press = pack.gestures.press.whileTap;
      expect(press.scaleY ?? press.scale).toBeLessThan(1);
      expect(pack.gestures.sink.whileTap.y).toBeGreaterThan(0);
    }
  });

  it('信号锁定：入场与按压逐帧硬切，换位与大面板走平滑曲线', () => {
    const cut = signal.transitions.enter.ease;
    expect(cut(0)).toBe(0);
    expect(cut(0.99)).toBe(0);
    expect(cut(1)).toBe(1);
    expect(signal.transitions.press.ease).toBe(cut);
    expect(Array.isArray(signal.transitions.move.ease)).toBe(true);
    expect(signal.variants.overlayEnter.visible).toEqual({ opacity: 1, y: 0 });
  });

  it('切包写入 <html data-motion> 并通知订阅者；未知 id 回落默认包', () => {
    expect(document.documentElement.dataset.motion).toBe(DEFAULT_MOTION_PACK_ID);
    const listener = vi.fn();
    const unsubscribe = subscribeMotionPack(listener);

    setMotionPack('no-such-pack');
    expect(getMotionPack().id).toBe(DEFAULT_MOTION_PACK_ID);
    expect(listener).not.toHaveBeenCalled();

    for (const id of Object.keys(MOTION_PACKS)) {
      setMotionPack(id);
      expect(getMotionPack()).toBe(MOTION_PACKS[id]);
      expect(document.documentElement.dataset.motion).toBe(id);
    }
    unsubscribe();
  });
});
