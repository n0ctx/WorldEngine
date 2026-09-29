import { describe, expect, it } from 'vitest';

import { DURATION, EASE, STAGGER, transitions } from '../../src/core/utils/motion.js';

describe('motion utils', () => {
  it('导出各动效包共用的时长、曲线与普通状态过渡', () => {
    expect(STAGGER.list).toBeGreaterThan(0);
    expect(transitions.ink.duration).toBe(DURATION.base);
    expect(transitions.medium.duration).toBe(DURATION.medium);
  });
});
