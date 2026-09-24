import { describe, expect, it } from 'vitest';

import { buildWorldScene } from '../../src/core/utils/worldScene.js';

describe('buildWorldScene', () => {
  it('同一个世界名永远得到同一幅场景', () => {
    expect(buildWorldScene('魔王与勇者')).toEqual(buildWorldScene('魔王与勇者'));
  });

  it('不同世界名得到不同场景', () => {
    const a = buildWorldScene('魔王与勇者');
    const b = buildWorldScene('纯爱');
    expect(a.layers.map((l) => l.d)).not.toEqual(b.layers.map((l) => l.d));
  });

  it('场景有天空渐变、光源和三层剪影，不是一块纯色', () => {
    const scene = buildWorldScene('豪宅世界');
    expect(scene.sky.top).not.toBe(scene.sky.bottom);
    expect(scene.light.color).toMatch(/^hsl\(/);
    expect(scene.layers).toHaveLength(3);
    for (const layer of scene.layers) expect(layer.d).toMatch(/^M.+Z$/);
  });
});
