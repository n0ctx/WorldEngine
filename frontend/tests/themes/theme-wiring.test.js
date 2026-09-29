import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

import { DEFAULT_THEME_ID } from '../../src/core/api/themes.js';
import { ACCENT_TEXT_BASIS_RGB, DARK_CANVAS_LUMINANCE_THRESHOLD } from '../../src/core/utils/accentBasis.js';
import { hexToRgb, relativeLuminance } from '../../src/core/utils/color.js';

// vitest 从 frontend/ 目录启动
const fromRepo = (...parts) => path.resolve(process.cwd(), '..', ...parts);
const readText = (...parts) => readFileSync(fromRepo(...parts), 'utf8');

function declarations(css) {
  const map = new Map();
  for (const match of css.matchAll(/(--we-[\w-]+)\s*:\s*([^;]+);/g)) map.set(match[1], match[2].trim());
  return map;
}

// 沿 var() 引用链解析到具体的十六进制色；主题的取值优先于核心默认值
function resolveHex(name, maps, depth = 0) {
  const value = maps.map((map) => map.get(name)).find((found) => found !== undefined);
  if (value === undefined || depth > 10) return null;
  const ref = value.match(/^var\((--we-[\w-]+)/);
  if (ref) return resolveHex(ref[1], maps, depth + 1);
  return /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

const CORE = declarations(readText('frontend', 'src', 'themes', 'tokens.css'));
const THEME_IDS = readdirSync(fromRepo('themes'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => entry.name);

describe('主题与世界主色', () => {
  it('会套用世界主色的深色主题，画布不能比取色基准更亮（否则主色按钮文字的 4.5:1 对比度保证不成立）', () => {
    const basis = relativeLuminance(ACCENT_TEXT_BASIS_RGB);
    for (const id of THEME_IDS) {
      const theme = declarations(readText('themes', id, 'theme.css'));
      const canvas = resolveHex('--we-color-bg-canvas', [theme, CORE]);
      expect(canvas, `${id} 的画布色无法解析成十六进制，请让测试的解析器支持它的写法`).not.toBeNull();
      const luminance = relativeLuminance(hexToRgb(canvas));
      if (luminance < DARK_CANVAS_LUMINANCE_THRESHOLD) {
        expect(luminance, `${id} 的画布 ${canvas} 比取色基准更亮，需调暗画布或调整 core/utils/accentBasis.js`).toBeLessThanOrEqual(basis);
      }
    }
  });

  it('默认主题 id 在前端、后端主题服务、后端配置三处一致，且对应一个真实存在的主题目录', () => {
    const themesService = readText('backend', 'services', 'themes.js').match(/const DEFAULT_THEME_ID = '([\w-]+)'/)?.[1];
    const config = readText('backend', 'services', 'config.js').match(/const DEFAULT_UI = \{[^}]*?theme: '([\w-]+)'/s)?.[1];
    expect([themesService, config]).toEqual([DEFAULT_THEME_ID, DEFAULT_THEME_ID]);
    expect(existsSync(fromRepo('themes', DEFAULT_THEME_ID, 'theme.json'))).toBe(true);
  });
});
