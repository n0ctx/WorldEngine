import { describe, expect, it } from 'vitest';

import { BLUR, DURATION, EASE, STAGGER, transitions, variants } from '../../src/utils/motion.js';

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
});
