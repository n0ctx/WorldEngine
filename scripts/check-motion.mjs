#!/usr/bin/env node
/**
 * 动效 token 漂移检查
 *
 * 真源：frontend/src/core/utils/motion.js（DURATION / EASE）。
 * CSS 侧 frontend/src/themes/tokens.css 的 --we-duration-* / --we-easing-* 必须
 * 与真源【语义对齐】，否则 framer-motion 与 CSS transition 表现会分叉。
 *
 * 语义映射：
 *   --we-duration-fast     ↔ DURATION.quick   (hover 色变)
 *   --we-duration-normal   ↔ DURATION.base    (局部反馈)
 *   --we-duration-slow     ↔ DURATION.medium  (组件入场)
 *   --we-duration-extended ↔ DURATION.slow    (慢显)
 *   --we-easing-ink/sharp/page/quill/retract ↔ EASE.ink/sharp/page/quill/retract
 *
 * 退出码：0 通过 / 1 漂移（硬错误，阻塞 CI）
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MOTION_JS = path.join(ROOT, 'frontend/src/core/utils/motion.js');
const TOKENS_CSS = path.join(ROOT, 'frontend/src/themes/tokens.css');

const { DURATION, EASE } = await import(pathToFileURL(MOTION_JS).href);

const css = readFileSync(TOKENS_CSS, 'utf8');
const errors = [];

// ─── 时长对齐 ────────────────────────────────────────────────────────────────
const DURATION_MAP = {
  '--we-duration-fast':     'quick',
  '--we-duration-normal':   'base',
  '--we-duration-slow':     'medium',
  '--we-duration-extended': 'slow',
};

function cssMs(token) {
  const m = css.match(new RegExp(`${token}\\s*:\\s*(\\d+(?:\\.\\d+)?)ms`));
  return m ? Number(m[1]) : null;
}

for (const [token, key] of Object.entries(DURATION_MAP)) {
  const want = Math.round((DURATION[key] ?? NaN) * 1000); // 秒 → ms
  const got = cssMs(token);
  if (got === null) errors.push(`时长缺失：${token} 在 tokens.css 未定义`);
  else if (got !== want) {
    errors.push(`时长漂移：${token} = ${got}ms，应为 ${want}ms（motion.js DURATION.${key} = ${DURATION[key]}s）`);
  }
}

// ─── 缓动对齐 ────────────────────────────────────────────────────────────────
const EASE_KEYS = ['ink', 'sharp', 'page', 'quill', 'retract'];

function cssBezier(token) {
  const m = css.match(new RegExp(`${token}\\s*:\\s*cubic-bezier\\(([^)]+)\\)`));
  if (!m) return null;
  return m[1].split(',').map((s) => Number(s.trim()));
}

function approx(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length
    && a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
}

for (const key of EASE_KEYS) {
  const token = `--we-easing-${key}`;
  const want = EASE[key];
  if (!Array.isArray(want)) { errors.push(`真源缺失：EASE.${key} 不是 cubic-bezier 数组`); continue; }
  const got = cssBezier(token);
  if (got === null) errors.push(`缓动缺失：${token} 在 tokens.css 未定义为 cubic-bezier`);
  else if (!approx(got, want)) {
    errors.push(`缓动漂移：${token} = cubic-bezier(${got.join(', ')})，应为 cubic-bezier(${want.join(', ')})（motion.js EASE.${key}）`);
  }
}

// ─── 输出 ────────────────────────────────────────────────────────────────────
if (errors.length) {
  console.error('\n✖ 动效 token 漂移：motion.js 与 tokens.css 不一致\n');
  for (const e of errors) console.error(`   ${e}`);
  console.error('\n   修正方式：以 motion.js 为真源，调整 tokens.css 对应 token。\n');
  process.exit(1);
}

console.log('✓ 动效 token 对齐：motion.js ↔ tokens.css 一致（时长 4 槽 + 缓动 5 条）');
process.exit(0);
