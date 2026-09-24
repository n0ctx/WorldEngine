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
    for (const key of ['press', 'portal', 'message', 'speaker', 'overlay']) {
      expect(SPRING[key].type).toBe('spring');
    }
    for (const key of Object.keys(GESTURE)) {
      expect(SPRING[key]).toBeDefined();
      expect(GESTURE[key].transition).toBeUndefined();
      expect(GESTURE[key].whileTap.scale).toBeLessThan(1);
    }
  });

  it('入场 variants 从位移/缩小态落到静止态', () => {
    for (const key of ['messageEnter', 'sceneEnter', 'overlayEnter']) {
      expect(variants[key].hidden.opacity).toBe(0);
      expect(variants[key].visible).toMatchObject({ opacity: 1, y: 0, scale: 1 });
    }
    expect(variants.speakerEnter.hidden.opacity).toBe(0);
    expect(variants.speakerEnter.visible).toMatchObject({ opacity: 1, x: 0, scale: 1 });
  });
});
