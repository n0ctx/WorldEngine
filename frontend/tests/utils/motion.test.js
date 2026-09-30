import { describe, expect, it } from 'vitest';

import { MOTION, STAGGER } from '../../src/core/utils/motion.js';

describe('motion utils', () => {
  it('每个节奏角色都有时长，除循环外都带曲线，可直接当 transition 用', () => {
    expect(STAGGER).toBeGreaterThan(0);
    for (const [name, role] of Object.entries(MOTION)) {
      expect(role.duration, name).toBeGreaterThan(0);
      if (name !== 'loop') expect(role.ease, name).toHaveLength(4);
    }
  });
});
