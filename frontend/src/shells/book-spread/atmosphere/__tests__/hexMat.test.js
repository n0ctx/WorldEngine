import { describe, it, expect } from 'vitest';
import { hexAt, hexCenter, rippleAt } from '../hexMat.js';

describe('hexMat — 格子与主题印刷的六角格对齐', () => {
  it('偶数行从贴图左上第一格的中心起，奇数行错开半格', () => {
    expect(hexCenter(0, 0)).toEqual({ x: 28, y: 33 });
    expect(hexCenter(1, 0)).toEqual({ x: 84, y: 33 });
    expect(hexCenter(1, 1)).toEqual({ x: 56, y: 83 });
    expect(hexCenter(0, 2)).toEqual({ x: 28, y: 133 });
  });

  it('格子中心和格内的点都落回这一格', () => {
    for (const [col, row] of [[0, 0], [3, 1], [-1, -1], [5, 6]]) {
      const c = hexCenter(col, row);
      expect(hexAt(c.x, c.y)).toEqual({ col, row });
      expect(hexAt(c.x + 20, c.y - 10)).toEqual({ col, row });
    }
  });

  it('两行之间的缝里，点归到更近的那一格', () => {
    // 贴图里竖线 x=28、y 在 66 到 100 之间，是奇数行两格的公共边
    expect(hexAt(20, 85)).toEqual({ col: 0, row: 1 });
    expect(hexAt(36, 85)).toEqual({ col: 1, row: 1 });
  });
});

describe('hexMat — 射程模板', () => {
  it('亮带向外推：刚按下时只有中心亮，稍后外圈亮、中心暗', () => {
    expect(rippleAt(0, 0)).toBeGreaterThan(0.9);
    expect(rippleAt(0, 100)).toBe(0);
    expect(rippleAt(0.25, 100)).toBeGreaterThan(0.3);
    expect(rippleAt(0.25, 0)).toBe(0);
  });

  it('推到尽头之后整圈收掉，射程外的格从不亮', () => {
    expect(rippleAt(5, 50)).toBe(0);
    expect(rippleAt(0.5, 400)).toBe(0);
  });
});
