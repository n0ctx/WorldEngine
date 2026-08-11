import { describe, it, expect } from 'vitest';
import {
  hexToRgb, rgbToHex, rgbToHsl, hslToRgb, relativeLuminance, contrastRatio, clamp,
} from '../color.js';

describe('color.js — hex/rgb 互转', () => {
  it('hexToRgb 解析 6 位与 3 位简写', () => {
    expect(hexToRgb('#7f95a8')).toEqual({ r: 127, g: 149, b: 168 });
    expect(hexToRgb('7f95a8')).toEqual({ r: 127, g: 149, b: 168 });
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('hexToRgb 对非法输入返回 null', () => {
    expect(hexToRgb('not-a-color')).toBeNull();
    expect(hexToRgb('')).toBeNull();
    expect(hexToRgb(null)).toBeNull();
    expect(hexToRgb(undefined)).toBeNull();
  });

  it('rgbToHex 往返一致', () => {
    expect(rgbToHex({ r: 127, g: 149, b: 168 })).toBe('#7f95a8');
    expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
    expect(rgbToHex({ r: 255, g: 255, b: 255 })).toBe('#ffffff');
  });

  it('rgbToHex 越界值会被 clamp', () => {
    expect(rgbToHex({ r: -10, g: 300, b: 128 })).toBe('#00ff80');
  });
});

describe('color.js — hsl 互转', () => {
  it('rgbToHsl → hslToRgb 往返近似一致', () => {
    const samples = [
      { r: 127, g: 149, b: 168 },
      { r: 200, g: 60, b: 60 },
      { r: 10, g: 200, b: 90 },
    ];
    for (const rgb of samples) {
      const hsl = rgbToHsl(rgb);
      const back = hslToRgb(hsl);
      expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(1);
    }
  });

  it('灰色（无色相）的饱和度为 0', () => {
    expect(rgbToHsl({ r: 128, g: 128, b: 128 }).s).toBe(0);
    expect(rgbToHsl({ r: 0, g: 0, b: 0 }).s).toBe(0);
    expect(rgbToHsl({ r: 255, g: 255, b: 255 }).s).toBe(0);
  });

  it('hslToRgb s=0 时输出灰色', () => {
    expect(hslToRgb({ h: 200, s: 0, l: 50 })).toEqual({ r: 128, g: 128, b: 128 });
  });
});

describe('color.js — 对比度', () => {
  it('黑白对比度为 21:1（WCAG 极值）', () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 0);
  });

  it('同色对比度为 1:1', () => {
    expect(contrastRatio({ r: 100, g: 100, b: 100 }, { r: 100, g: 100, b: 100 })).toBeCloseTo(1, 5);
  });

  it('relativeLuminance 黑为 0，白为 1', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });

  it('clamp 夹住上下界', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
  });
});
