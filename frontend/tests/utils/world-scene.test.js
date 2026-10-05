import { describe, expect, it } from 'vitest';

import { buildWorldScene, SCENE_HEIGHT, SCENE_WIDTH } from '../../src/core/utils/worldScene.js';

describe('buildWorldScene', () => {
  it('同一个世界名永远得到同一幅星图', () => {
    expect(buildWorldScene('魔王与勇者')).toEqual(buildWorldScene('魔王与勇者'));
  });

  it('不同世界名得到不同星图：色相、行星位置和坐标码都不同', () => {
    const a = buildWorldScene('魔王与勇者');
    const b = buildWorldScene('纯爱');
    expect(a.hue).not.toBe(b.hue);
    expect(a.planet).not.toEqual(b.planet);
    expect(a.code).not.toBe(b.code);
  });

  it('世界名的每个字是一颗星，最多七颗，至少两颗连成线', () => {
    expect(buildWorldScene('缅北黑暗面').stars).toHaveLength(5);
    expect(buildWorldScene('一个名字特别特别长的世界').stars).toHaveLength(7);
    expect(buildWorldScene('爱').stars).toHaveLength(2);
    expect(buildWorldScene('').stars).toHaveLength(2);
  });

  it('星座在左上、行星在右下，彼此不挡', () => {
    for (const name of ['魔王与勇者', '纯爱', '豪宅世界', '星海']) {
      const { stars, planet } = buildWorldScene(name);
      for (const star of stars) {
        expect(star.x).toBeLessThan(SCENE_WIDTH * 0.6);
        expect(star.y).toBeLessThan(SCENE_HEIGHT * 0.5);
      }
      expect(planet.cx).toBeGreaterThan(SCENE_WIDTH * 0.55);
      expect(planet.cy).toBeGreaterThan(SCENE_HEIGHT * 0.5);
    }
  });

  it('给氛围光的染色取这幅画自己的色相', () => {
    const scene = buildWorldScene('豪宅世界');
    expect(scene.tint).toBe(`hsl(${scene.hue} 80% 70%)`);
    expect(scene.code).toMatch(/^WE-\d{4}$/);
  });
});
