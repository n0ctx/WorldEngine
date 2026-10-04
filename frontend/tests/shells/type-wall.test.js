import { describe, expect, it } from 'vitest';
import { keepAt, liftAt, poolOf } from '../../src/shells/book-spread/atmosphere/typeWall.js';

// 波浪从 0 秒出发，一格沿波浪方向的位置在 340 时，波浪在 0.9 秒扫到它
const WAVE = { start: 0, span: 1000, hold: 5 };
const CX = 340;

describe('字模墙', () => {
  it('字模上的字取名字里的字母和汉字，不够时补默认字；没有名字时拼默认词', () => {
    const pool = poolOf(['雨夜·拳场', 'Neo Tokyo', '雨夜']);
    expect(pool.words).toEqual(['雨夜·拳场', 'Neo Tokyo', '雨夜']);
    expect(pool.chars).toEqual(expect.arrayContaining(['雨', '夜', '拳', '场', 'N', 'k']));
    expect(pool.chars).not.toContain('·');
    expect(pool.chars).not.toContain(' ');
    expect(new Set(pool.chars).size).toBe(pool.chars.length);

    const sparse = poolOf(['甲']);
    expect(sparse.chars[0]).toBe('甲');
    expect(sparse.chars.length).toBeGreaterThan(6);

    const empty = poolOf([]);
    expect(empty.words.length).toBeGreaterThan(0);
    expect(empty.chars.length).toBeGreaterThan(6);
  });

  it('没有波浪时一格都不动；波浪扫过名字以外的格只起伏一下，不露朱砂侧面', () => {
    expect(liftAt(null, 3, CX, true)).toEqual({ h: 0 });
    expect(liftAt(WAVE, 0.5, CX, false).h).toBe(0);
    const crest = liftAt(WAVE, 1.044, CX, false);
    expect(crest.h).toBeGreaterThan(3.9);
    expect(crest.h).toBeLessThanOrEqual(4);
    expect(crest.word).toBeUndefined();
    expect(liftAt(WAVE, 2, CX, false).h).toBe(0);
  });

  it('名字里的格随波抬起、停够了随第二道波压回', () => {
    expect(liftAt(WAVE, 0.8, CX, true)).toMatchObject({ h: 0, word: false });
    const raised = liftAt(WAVE, 1.25, CX, true);
    expect(raised.word).toBe(true);
    expect(raised.h).toBeCloseTo(7, 1);
    expect(liftAt(WAVE, 6, CX, true)).toMatchObject({ h: 7, word: true });
    expect(liftAt(WAVE, 7.7, CX, true)).toMatchObject({ h: 0, word: false });
  });

  it('墙在画面中间压淡，往四边回到满浓度，直接放在书桌上的字才读得清', () => {
    expect(keepAt(800, 450, 1600, 900)).toBeCloseTo(0.35, 2);
    expect(keepAt(0, 0, 1600, 900)).toBeCloseTo(1, 2);
    const mid = keepAt(400, 450, 1600, 900);
    expect(mid).toBeGreaterThan(0.35);
    expect(mid).toBeLessThan(1);
  });
});
