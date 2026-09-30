import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

import { contrastRatio, hexToRgb } from '../../src/core/utils/color.js';

// vitest 从 frontend/ 目录启动
const fromRepo = (...parts) => path.resolve(process.cwd(), '..', ...parts);
const readText = (...parts) => readFileSync(fromRepo(...parts), 'utf8');

function declarations(css) {
  const map = new Map();
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--we-[\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(match[1], match[2].trim());
  }
  return map;
}

// color-mix(in oklab, …) 的换算，与浏览器一致：sRGB → 线性 → OKLab 插值 → 回 sRGB
const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function toOklab({ r, g, b }) {
  const [lr, lg, lb] = [r, g, b].map((v) => toLinear(v / 255));
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const [r, g, bl] = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.round(Math.min(1, Math.max(0, toGamma(v))) * 255));
  return { r, g, b: bl };
}

function mixOklab(a, b, weight) {
  const [A, B] = [toOklab(a), toOklab(b)];
  return fromOklab(A.map((v, i) => v * weight + B[i] * (1 - weight)));
}

const CORE = declarations(readText('frontend', 'src', 'themes', 'tokens.css'));
const THEME_IDS = readdirSync(fromRepo('themes'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => entry.name);

// 解析一个推导色：直接引用基础色，或 color-mix(in oklab, <色> N%, <色>)；色可以是 var(--we-base-*)、var(--we-color-white)
function resolve(name, theme) {
  const value = theme.get(name) ?? CORE.get(name);
  if (/^#[0-9a-f]{6}$/i.test(value)) return hexToRgb(value);
  const ref = value.match(/^var\((--we-[\w-]+)\)$/);
  if (ref) return resolve(ref[1], theme);
  const mix = value.match(/^color-mix\(in oklab, var\((--we-[\w-]+)\) (\d+)%, var\((--we-[\w-]+)\)\)$/);
  if (!mix) throw new Error(`${name} 的写法 ${value} 超出本测试的解析范围`);
  return mixOklab(resolve(mix[1], theme), resolve(mix[3], theme), Number(mix[2]) / 100);
}

// [前景, 背景, 下限]：正文级文字 4.5:1，控件边界与弱文字 3:1（WCAG 1.4.3 / 1.4.11）
const PAIRS = [
  ['--we-color-text-secondary', '--we-color-bg-canvas', 4.5],
  ['--we-color-text-secondary', '--we-color-bg-surface', 4.5],
  ['--we-color-text-secondary', '--we-color-bg-elevated', 4.5],
  ['--we-color-text-tertiary', '--we-color-bg-canvas', 4.5],
  ['--we-color-text-tertiary', '--we-color-bg-surface', 4.5],
  ['--we-color-border-strong', '--we-color-bg-canvas', 3],
  ['--we-color-border-strong', '--we-color-bg-surface', 3],
  ['--we-color-text-inverse', '--we-color-accent', 4.5],
];

describe('推导色的对比度', () => {
  for (const id of THEME_IDS) {
    it(`${id}：文字各级、强边框、主色按钮文字达到对比度下限`, () => {
      const theme = declarations(readText('themes', id, 'theme.css'));
      for (const [fg, bg, min] of PAIRS) {
        const ratio = contrastRatio(resolve(fg, theme), resolve(bg, theme));
        expect(ratio, `${id} 的 ${fg} 在 ${bg} 上只有 ${ratio.toFixed(2)}:1，低于 ${min}:1`).toBeGreaterThanOrEqual(min);
      }
    });
  }
});
