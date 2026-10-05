import { describe, expect, it } from 'vitest';

import { buildWorldScene, SCENE_VIEWS, worldSceneTint } from '../../src/core/utils/worldScene.js';

const NAMES = ['豪宅世界', '魔王与勇者', '纯爱', '缅北黑暗面', '凡人修仙', '丧尸末日', '无限轮回', '江湖', ''];

// 路径里所有坐标点
function pathPoints(d) {
  return [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
}

describe('buildWorldScene', () => {
  it('同一个世界名永远得到同一张地图', () => {
    expect(buildWorldScene('魔王与勇者')).toEqual(buildWorldScene('魔王与勇者'));
    expect(buildWorldScene('魔王与勇者', 'banner')).toEqual(buildWorldScene('魔王与勇者', 'banner'));
  });

  it('不同世界名得到不同地图：海色、海岸线和城镇都不同', () => {
    const a = buildWorldScene('魔王与勇者');
    const b = buildWorldScene('纯爱');
    expect(a.hue).not.toBe(b.hue);
    expect(a.islands[0]).not.toBe(b.islands[0]);
    expect(a.towns).not.toEqual(b.towns);
  });

  it('横幅只换镜头：主岛和岛上的山、林、城镇、航路与世界卡相同，整体平移', () => {
    for (const name of NAMES) {
      const card = buildWorldScene(name, 'card');
      const banner = buildWorldScene(name, 'banner');
      const [cardIsland] = card.islands.map(pathPoints);
      const [bannerIsland] = banner.islands.map(pathPoints);
      const dx = bannerIsland[0].x - cardIsland[0].x;
      const dy = bannerIsland[0].y - cardIsland[0].y;
      const shifted = (p) => ({ x: p.x + dx, y: p.y + dy });
      bannerIsland.forEach((p, i) => {
        expect(p.x).toBeCloseTo(shifted(cardIsland[i]).x, 0);
        expect(p.y).toBeCloseTo(shifted(cardIsland[i]).y, 0);
      });
      for (const key of ['peaks', 'towns', 'hills']) {
        expect(banner[key]).toHaveLength(card[key].length);
        banner[key].forEach((p, i) => {
          expect(p.x).toBeCloseTo(shifted(card[key][i]).x, 0);
          expect(p.y).toBeCloseTo(shifted(card[key][i]).y, 0);
        });
      }
      // 横幅两侧各一座远岛
      expect(banner.islands.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('世界卡左下角留给名字：罗盘、船、海蛇都不进去', () => {
    const { width, height } = SCENE_VIEWS.card;
    for (const name of NAMES) {
      const scene = buildWorldScene(name);
      const underName = (p) => p.x < width * 0.45 && p.y > height * 0.7;
      expect(underName(scene.compass)).toBe(false);
      for (const ship of scene.ships) expect(underName(ship)).toBe(false);
      if (scene.serpent) expect(underName(scene.serpent)).toBe(false);
    }
  });

  it('陆地和城镇都在边框以内', () => {
    for (const layout of ['card', 'banner']) {
      const { width, height } = SCENE_VIEWS[layout];
      for (const name of NAMES) {
        const scene = buildWorldScene(name, layout);
        for (const p of [...scene.islands.flatMap(pathPoints), ...scene.towns]) {
          expect(p.x).toBeGreaterThan(0);
          expect(p.x).toBeLessThan(width);
          expect(p.y).toBeGreaterThan(0);
          expect(p.y).toBeLessThan(height);
        }
      }
    }
  });

  it('氛围染色与整张图同源，可以不画图直接取', () => {
    for (const name of NAMES) expect(worldSceneTint(name)).toBe(buildWorldScene(name).tint);
  });
});
