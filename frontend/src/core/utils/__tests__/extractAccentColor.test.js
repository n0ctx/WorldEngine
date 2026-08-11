import { describe, it, expect } from 'vitest';
import {
  quantizeDominantColor, computeAccentColor, FALLBACK_ACCENT_HEX,
} from '../extractAccentColor.js';
import { hexToRgb, rgbToHsl, contrastRatio } from '../color.js';

// 主色按钮文字实际用的是 --we-color-bg-canvas（nocturne: #15181b），不是纯黑。
// 纯黑亮度为 0，是两者中"最容易达标"的极端值，用它当基准会把实际不达标的颜色也放行
// （回归用例见下方"用真实深色主题文字色校验"）——测试必须用同一基准，否则测不出这类问题。
const DARK_THEME_TEXT_RGB = { r: 0x15, g: 0x18, b: 0x1b };

function solidPixels(r, g, b, a, count) {
  const arr = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    arr[i * 4] = r;
    arr[i * 4 + 1] = g;
    arr[i * 4 + 2] = b;
    arr[i * 4 + 3] = a;
  }
  return arr;
}

describe('quantizeDominantColor', () => {
  it('空数组返回 null', () => {
    expect(quantizeDominantColor(new Uint8ClampedArray(0))).toBeNull();
  });

  it('全透明像素被忽略，返回 null', () => {
    const pixels = solidPixels(200, 30, 30, 0, 10);
    expect(quantizeDominantColor(pixels)).toBeNull();
  });

  it('单一颜色的图片提取出该颜色（近似，量化误差内）', () => {
    const pixels = solidPixels(200, 40, 40, 255, 100);
    const dominant = quantizeDominantColor(pixels);
    expect(dominant.r).toBeGreaterThan(180);
    expect(dominant.g).toBeLessThan(60);
    expect(dominant.b).toBeLessThan(60);
  });

  it('两色混合图片选出出现次数更多的那个桶（两桶彩度相当时，频率仍是决定因素）', () => {
    const majority = solidPixels(20, 120, 200, 255, 70); // 蓝色，70 像素，chroma=180
    const minority = solidPixels(200, 20, 20, 255, 30);  // 红色，30 像素，chroma=180
    const pixels = new Uint8ClampedArray(majority.length + minority.length);
    pixels.set(majority, 0);
    pixels.set(minority, majority.length);
    const dominant = quantizeDominantColor(pixels);
    // 应该落在蓝色桶附近，而不是红色
    expect(dominant.b).toBeGreaterThan(dominant.r);
  });

  it('频率更高但彩度低的桶，被像素更少但彩度显著更高的桶反超（频率×彩度加权，而非单纯频率）', () => {
    // 灰绿背景：60 像素，chroma=20（勉强过彩度筛选阈值，但很不鲜艳）
    const majority = solidPixels(110, 90, 95, 255, 60);
    // 橙红色块：仅 40 像素，但 chroma=190，彩度远高于背景
    const minority = solidPixels(220, 60, 30, 255, 40);
    const pixels = new Uint8ClampedArray(majority.length + minority.length);
    pixels.set(majority, 0);
    pixels.set(minority, majority.length);
    const dominant = quantizeDominantColor(pixels);
    // 60*20=1200 < 40*190=7600，加权后橙红色块胜出
    expect(dominant.r).toBeGreaterThan(dominant.b);
    expect(dominant.r).toBeGreaterThan(150);
  });

  it('回归：暗部占绝大多数、但有一块彩度鲜明的中景色时，不应被暗部背景带偏（暗部已被像素级剔除）', () => {
    // 近黑背景：800 像素，chroma≈3，亮度≈4%——像素级筛选会直接剔除，不参与加权
    const darkBg = solidPixels(10, 9, 11, 255, 800);
    // 鲜艳蓝色中景：200 像素，chroma≈150，亮度≈45%，占比 20%，足以判定"这张图有色彩印象"
    const vividFg = solidPixels(30, 90, 180, 255, 200);
    const pixels = new Uint8ClampedArray(darkBg.length + vividFg.length);
    pixels.set(darkBg, 0);
    pixels.set(vividFg, darkBg.length);
    const dominant = quantizeDominantColor(pixels);
    expect(dominant).not.toBeNull();
    expect(dominant.b).toBeGreaterThan(dominant.r);
    expect(dominant.b).toBeGreaterThan(100);
  });

  it('预筛后合格像素占比过低（几乎全黑白灰，仅零星噪点色）时返回 null，不矮子里拔将军', () => {
    // 近黑背景：1000 像素，彩度极低，会被剔除
    const darkBg = solidPixels(8, 8, 9, 255, 1000);
    // 零星彩色噪点：仅 15 像素，占比 1.5% < 2% 阈值
    const noise = solidPixels(200, 60, 30, 255, 15);
    const pixels = new Uint8ClampedArray(darkBg.length + noise.length);
    pixels.set(darkBg, 0);
    pixels.set(noise, darkBg.length);
    expect(quantizeDominantColor(pixels)).toBeNull();
  });
});

describe('computeAccentColor — 主路径', () => {
  it('中等饱和度的输入色，压低饱和度后仍保留原色相', () => {
    // 一个鲜艳但不极端的蓝色
    const hex = computeAccentColor({ r: 40, g: 110, b: 200 });
    const hsl = rgbToHsl(hexToRgb(hex));
    // 原色相约 210°，容许量化/夹取误差
    expect(hsl.h).toBeGreaterThan(190);
    expect(hsl.h).toBeLessThan(230);
  });

  it('结果饱和度不超过压低后的上限（全站只此一处彩色，不能盖过封面本身）', () => {
    const hex = computeAccentColor({ r: 255, g: 0, b: 0 }); // 纯红，s=100%
    const hsl = rgbToHsl(hexToRgb(hex));
    expect(hsl.s).toBeLessThanOrEqual(35);
  });

  it('结果与深色主题按钮文字色（#15181b）对比度达到 4.5:1 以上（用作按钮主色的硬约束）', () => {
    const samples = [
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
      { r: 0, g: 0, b: 255 },
      { r: 40, g: 110, b: 200 },
      { r: 180, g: 30, b: 180 },
      { r: 20, g: 20, b: 40 },   // 很暗的蓝
      { r: 97, g: 114, b: 174 }, // 回归：曾经对纯黑算出 4.5+ 但对真实文字色只有 3.84:1
    ];
    for (const rgb of samples) {
      const hex = computeAccentColor(rgb);
      const ratio = contrastRatio(hexToRgb(hex), DARK_THEME_TEXT_RGB);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('computeAccentColor — 兜底分支', () => {
  it('输入为 null（没有可用像素）时返回兜底色', () => {
    expect(computeAccentColor(null)).toBe(FALLBACK_ACCENT_HEX);
  });

  it('近似纯黑封面（无有效色相）时返回兜底色', () => {
    expect(computeAccentColor({ r: 5, g: 5, b: 6 })).toBe(FALLBACK_ACCENT_HEX);
  });

  it('近似纯白封面（无有效色相）时返回兜底色', () => {
    expect(computeAccentColor({ r: 250, g: 250, b: 248 })).toBe(FALLBACK_ACCENT_HEX);
  });

  it('中性灰封面（无有效色相）时返回兜底色', () => {
    expect(computeAccentColor({ r: 128, g: 130, b: 127 })).toBe(FALLBACK_ACCENT_HEX);
  });

  it('兜底色本身也满足对比度硬约束', () => {
    const ratio = contrastRatio(hexToRgb(FALLBACK_ACCENT_HEX), DARK_THEME_TEXT_RGB);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
