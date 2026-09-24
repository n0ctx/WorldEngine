import { describe, expect, it } from 'vitest';

import { BLUR, DURATION, EASE, GESTURE, SPRING, STAGGER, transitions, variants } from '../../src/core/utils/motion.js';

describe('motion utils', () => {
  it('导出稳定的动效 token 和预组合配置', () => {
    expect(DURATION.instant).toBe(0);
    expect(EASE.linear).toBe('linear');
    expect(STAGGER.list).toBeGreaterThan(0);
    expect(BLUR.entry).toMatch(/px$/);
    expect(variants.inkRise.hidden.y).toBe(8);
    expect(transitions.ink.duration).toBe(DURATION.base);
    expect(transitions.quick.ease).toBe(EASE.sharp);
  });

  it('命名弹簧都是 spring 类型，手势只含目标值不含 transition', () => {
    for (const key of ['press', 'portal', 'message', 'speaker', 'overlay', 'sink', 'glowFade']) {
      expect(SPRING[key].type).toBe('spring');
    }
    for (const key of Object.keys(GESTURE)) {
      expect(SPRING[key]).toBeDefined();
      expect(GESTURE[key].transition).toBeUndefined();
    }
    // 按下的反馈：压缩或陷落
    expect(GESTURE.press.whileTap.scale).toBeLessThan(1);
    expect(GESTURE.portal.whileTap.scale).toBeLessThan(1);
    expect(GESTURE.sink.whileTap.y).toBeGreaterThan(0);
    // 世界入口悬停只让位，不放大
    expect(GESTURE.portal.whileHover).toEqual({ y: expect.any(Number) });
  });

  it('入场 variants 从位移/缩小态落到静止态，且各表面只用一种运动', () => {
    for (const key of ['messageEnter', 'sceneEnter', 'overlayEnter', 'speakerEnter']) {
      expect(variants[key].hidden.opacity).toBe(0);
      expect(variants[key].visible.opacity).toBe(1);
    }
    expect(variants.messageEnter.visible).toEqual({ opacity: 1, y: 0 });
    expect(variants.speakerEnter.visible).toEqual({ opacity: 1, x: 0 });
    expect(variants.overlayEnter.visible).toEqual({ opacity: 1, scale: 1 });
    expect(variants.sceneEnter.visible).toMatchObject({ opacity: 1, y: 0, scale: 1 });
  });
});
