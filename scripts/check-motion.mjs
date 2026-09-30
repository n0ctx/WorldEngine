#!/usr/bin/env node
/**
 * 动效角色漂移检查
 *
 * 真源：frontend/src/core/utils/motion.js（MOTION / STAGGER）。
 * CSS 侧 frontend/src/themes/tokens.css 的 --we-motion-<角色>-duration / -easing 与 --we-motion-stagger
 * 必须与真源同名同值，否则 framer-motion 与 CSS transition 表现会分叉；两边的角色也必须一一对应。
 * 动效包可以改写节奏角色：JS 写在包的 rhythm 里，CSS 写在 themes/motion/<id>.css 的 :root[data-motion="<id>"] 里，
 * 两边必须同值、同一组角色，改写的角色必须存在。
 *
 * 动效包的边界：包样式只能声明两类 --we-* 变量——接口 --we-fx-*（核心样式经它引用包的动画）与节奏角色 --we-motion-*；
 * 其余变量用本包私有前缀（墨流 --ink-*，信号 --sig-*），不占核心命名。核心引用的每个 --we-fx-* 每个包都要声明，
 * 包声明的 --we-fx-* 也必须被核心引用。
 *
 * 退出码：0 通过 / 1 漂移（硬错误，阻塞 CI）
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootFlag = process.argv.indexOf('--root');
const ROOT = rootFlag === -1 ? path.resolve(__dirname, '..') : path.resolve(process.argv[rootFlag + 1]);
const MOTION_JS = path.join(ROOT, 'frontend/src/core/utils/motion.js');
const TOKENS_CSS = path.join(ROOT, 'frontend/src/themes/tokens.css');
const MOTION_PACK_JS = path.join(ROOT, 'frontend/src/core/motion/motionPack.js');
const PACK_CSS_DIR = path.join(ROOT, 'frontend/src/themes/motion');
const CORE_CSS = ['themes/ui.css', 'themes/pages.css', 'themes/chat.css', 'index.css'].map((rel) => path.join(ROOT, 'frontend/src', rel));
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');

const { MOTION, STAGGER } = await import(pathToFileURL(MOTION_JS).href);
const { MOTION_PACKS } = await import(pathToFileURL(MOTION_PACK_JS).href);

const css = readFileSync(TOKENS_CSS, 'utf8');
const errors = [];

function cssMs(token) {
  const m = css.match(new RegExp(`${token}\\s*:\\s*(\\d+(?:\\.\\d+)?)ms`));
  return m ? Number(m[1]) : null;
}

function cssBezier(token) {
  const m = css.match(new RegExp(`${token}\\s*:\\s*cubic-bezier\\(([^)]+)\\)`));
  if (!m) return null;
  return m[1].split(',').map((s) => Number(s.trim()));
}

function approx(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length
    && a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
}

function checkMs(token, seconds, source) {
  const want = Math.round(seconds * 1000);
  const got = cssMs(token);
  if (got === null) errors.push(`时长缺失：${token} 在 tokens.css 未定义`);
  else if (got !== want) errors.push(`时长漂移：${token} = ${got}ms，应为 ${want}ms（motion.js ${source} = ${seconds}s）`);
}

// ─── 角色对齐 ────────────────────────────────────────────────────────────────
for (const [role, { duration, ease }] of Object.entries(MOTION)) {
  checkMs(`--we-motion-${role}-duration`, duration, `MOTION.${role}.duration`);
  if (!ease) continue;
  const token = `--we-motion-${role}-easing`;
  const got = cssBezier(token);
  if (got === null) errors.push(`缓动缺失：${token} 在 tokens.css 未定义为 cubic-bezier`);
  else if (!approx(got, ease)) {
    errors.push(`缓动漂移：${token} = cubic-bezier(${got.join(', ')})，应为 cubic-bezier(${ease.join(', ')})（motion.js MOTION.${role}.ease）`);
  }
}
checkMs('--we-motion-stagger', STAGGER, 'STAGGER');

// CSS 多出来的角色
const cssRoles = new Set([...css.matchAll(/--we-motion-([a-z]+)-(?:duration|easing)\s*:/g)].map((m) => m[1]));
for (const role of cssRoles) {
  if (!MOTION[role]) errors.push(`角色缺失：tokens.css 有 --we-motion-${role}-*，motion.js 的 MOTION 没有 ${role}`);
}

// ─── 动效包改写的节奏 ─────────────────────────────────────────────────────────
const packCss = (id) => stripComments(readFileSync(path.join(PACK_CSS_DIR, `${id}.css`), 'utf8'));

function packRootDecls(id) {
  const text = packCss(id);
  const root = new RegExp(`(?:^|\\})\\s*:root\\[data-motion="${id}"\\]\\s*\\{([^}]*)\\}`).exec(text)?.[1] ?? '';
  return Object.fromEntries([...root.matchAll(/(--we-motion-[a-z-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

for (const pack of Object.values(MOTION_PACKS)) {
  const css = packRootDecls(pack.id);
  const want = {};
  for (const [role, override] of Object.entries(pack.rhythm ?? {})) {
    if (!MOTION[role]) { errors.push(`包 ${pack.id}：rhythm 改写了不存在的角色 ${role}`); continue; }
    if (override.duration !== undefined) want[`--we-motion-${role}-duration`] = `${Math.round(override.duration * 1000)}ms`;
    if (override.ease) want[`--we-motion-${role}-easing`] = `cubic-bezier(${override.ease.join(', ')})`;
  }
  for (const [token, value] of Object.entries(want)) {
    if (css[token] === undefined) errors.push(`包 ${pack.id}：JS rhythm 改写了 ${token}，${pack.id}.css 的 :root 里没写（应为 ${value}）`);
    else if (css[token].replace(/\s+/g, '') !== value.replace(/\s+/g, '')) errors.push(`包 ${pack.id}：${token} CSS 是 ${css[token]}，JS rhythm 是 ${value}`);
  }
  for (const token of Object.keys(css)) {
    if (!(token in want)) errors.push(`包 ${pack.id}：${pack.id}.css 改写了 ${token}，JS 的 rhythm 里没有`);
  }
}

// ─── 动效包的边界与 --we-fx-* 接口 ─────────────────────────────────────────────
const coreFx = new Set(CORE_CSS.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/var\(\s*--we-fx-([a-z-]+)/g)].map((m) => m[1])));
const coreMotionTokens = new Set([...css.matchAll(/(--we-motion-[a-z-]+)\s*:/g)].map((m) => m[1]));

for (const pack of Object.values(MOTION_PACKS)) {
  const declared = [...packCss(pack.id).matchAll(/(?:^|[;{\s])(--we-[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
  const fx = new Set();
  for (const token of declared) {
    if (token.startsWith('--we-fx-')) fx.add(token.slice('--we-fx-'.length));
    else if (!token.startsWith('--we-motion-')) errors.push(`包 ${pack.id}：声明了核心命名的 ${token}；包自己的变量改用本包私有前缀`);
    else if (!coreMotionTokens.has(token)) errors.push(`包 ${pack.id}：${token} 不是 tokens.css 里的节奏角色`);
  }
  for (const name of coreFx) if (!fx.has(name)) errors.push(`包 ${pack.id}：核心样式引用了 --we-fx-${name}，${pack.id}.css 没声明`);
  for (const name of fx) if (!coreFx.has(name)) errors.push(`包 ${pack.id}：声明了 --we-fx-${name}，核心样式没有引用`);
}

// ─── 输出 ────────────────────────────────────────────────────────────────────
if (errors.length) {
  console.error('\n✖ 动效角色漂移：motion.js 与 tokens.css 不一致\n');
  for (const e of errors) console.error(`   ${e}`);
  console.error('\n   修正方式：以 motion.js 为真源，调整 tokens.css 对应角色。\n');
  process.exit(1);
}

console.log(`✓ 动效角色对齐：motion.js ↔ tokens.css 一致（${Object.keys(MOTION).length} 个角色 + 错峰），${Object.keys(MOTION_PACKS).length} 个动效包的节奏改写 JS ↔ CSS 一致、边界与 --we-fx-* 接口完整`);
process.exit(0);
