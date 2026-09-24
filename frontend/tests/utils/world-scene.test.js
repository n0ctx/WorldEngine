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

  it('远层更亮、近层更暗，每层都有边缘起伏的雾片隔开下一层', () => {
    for (const name of ['魔王与勇者', '纯爱', '豪宅世界', '星海']) {
      const [far, mid, near] = buildWorldScene(name).layers;
      expect(far.lightness).toBeGreaterThan(mid.lightness);
      expect(mid.lightness).toBeGreaterThan(near.lightness);
      expect(far.fog).toMatch(/^M.+Q.+Z$/);
      expect(mid.fog).toMatch(/^M.+Q.+Z$/);
      expect(near.fog).toBeNull();
    }
  });

  it('最远一层山脊是平滑曲线，不是折线锯齿', () => {
    const [far] = buildWorldScene('魔王与勇者').layers;
    expect(far.d).toContain(' Q');
  });
});
