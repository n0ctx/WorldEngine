#!/usr/bin/env node
/**
 * 主题系统三层对齐检查
 *
 * 检查四个问题：
 *   A. 模板盲区   — 主题可写的内核视觉 token 在 _template/theme.css 里看不到，主题作者无从覆盖（硬错误）
 *   B. 孤悬覆盖   — 主题包覆盖了内核里根本不存在的 token（可能是改名后遗留，硬错误）
 *   C. 主题缺失   — 模板列出的关键 token 某主题没有覆盖（主题可以只覆盖需要的部分，仅提示，不影响退出码）
 *   D. 越权覆盖   — 主题或模板写了白名单（THEME_WRITABLE）以外的核心 token（硬错误）：语义色、壳层色、
 *                   阴影与高度阶梯、状态层等都由核心从基础色推导，主题只写基础色、字体、圆角与少数质感例外
 *
 * 新增或改名核心 token 时，同一次提交里要同步 _template/theme.css，否则 A 失败。
 *
 * 用法：node scripts/check-theme-alignment.mjs [--root <dir>]
 *
 * 退出码：0 通过 / 1 发现 A、B 或 D
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootFlag = process.argv.indexOf('--root');
const ROOT = rootFlag === -1 ? path.resolve(__dirname, '..') : path.resolve(process.argv[rootFlag + 1]);

// ─── 路径配置 ────────────────────────────────────────────────────────────────
const CORE_FILES = [
  path.join(ROOT, 'frontend/src/themes/tokens.css'),
  path.join(ROOT, 'frontend/src/themes/fonts.css'),
];
const TEMPLATE_FILE = path.join(ROOT, 'themes/_template/theme.css');
const THEMES_DIR = path.join(ROOT, 'themes');

// ─── 不属于"主题视觉 token"范围，排除出 A/C 检查 ───────────────────────────
const SKIP_PREFIXES = [
  '--we-z-',           // z-index，不在主题范围
  '--we-space-',       // 间距，结构性，主题不改
  '--we-alpha-',       // 透明度阶梯，结构性，主题不改
  '--we-opacity-disabled', // 不可用控件的透明度，结构性，主题不改
  '--we-topbar-height',// 顶栏高度，结构尺寸，主题不改
  '--we-range-',       // 功能性渐变（JS 动态变量）
  '--we-status-table-',// JS 运行时 token
  '--we-worlds-grid-', // JS 运行时 token
  '--we-worlds-visible-',
  '--we-worlds-card-',
  '--we-duration-',    // 动效（主题可选覆盖，不强制）
  '--we-easing-',      // 动效缓动
  '--we-type-',        // 字体角色：结构量，全站统一，主题不改
  '--we-leading-',     // 单行居中行高
  '--we-glyph-',       // 字符图标尺寸
  '--we-weight-',      // 字重
  '--we-focus-ring',   // 通用焦点环，通常不需主题定制
  '--we-danmaku-',                 // 弹幕色板：固定的多色循环取色集，不随主题变化
];

// ─── 工具函数 ─────────────────────────────────────────────────────────────────
function readCss(file) {
  try { return readFileSync(file, 'utf8'); }
  catch { return ''; }
}

/** 提取 CSS 文件中所有 --we-xxx: 形式的定义（取等号左侧 token 名） */
function extractDefined(css) {
  const tokens = new Set();
  // 匹配行首/空白后的 --we-xxx:（避免匹配 var(--we-xxx) 后面跟冒号的情况）
  const re = /(?:^|[\s;{])(\-\-we-[a-zA-Z0-9-]+)\s*:/gm;
  let m;
  while ((m = re.exec(css)) !== null) tokens.add(m[1]);
  return tokens;
}

function isVisual(token) {
  return !SKIP_PREFIXES.some((p) => token.startsWith(p));
}

// 主题可写的 token：基础色板与阴影浓度、明暗方案、字体、圆角与动效时长，以及少数质感例外。
// 其余核心 token 由核心推导，主题写了算越权；这里放宽之前先确认它无法由基础色推导出来。
const THEME_WRITABLE = [
  '--we-base-', '--we-shadow-strength', '--we-color-scheme', '--we-font-', '--we-radius-', '--we-duration-',
  '--we-atmosphere-', '--we-material-sheen', '--we-material-grain', '--we-glass-opacity', '--we-glass-blur',
  '--we-blur-scrim', '--we-stage-surface', '--we-pane-', '--we-card-bg', '--we-card-border', '--we-card-overlay-',
  '--we-canvas-texture-image', '--we-parchment-',
];
const isWritable = (token) => THEME_WRITABLE.some((p) => token.startsWith(p));

function themeIds() {
  return readdirSync(THEMES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name);
}

// ─── 解析 ─────────────────────────────────────────────────────────────────────
const coreTokensSet = new Set();
for (const f of CORE_FILES) {
  for (const t of extractDefined(readCss(f))) coreTokensSet.add(t);
}
const isThemeWritable = (token) => isVisual(token) && isWritable(token);

const templateTokens = extractDefined(readCss(TEMPLATE_FILE));

const themes = {};
for (const id of themeIds()) {
  const css = readCss(path.join(THEMES_DIR, id, 'theme.css'));
  themes[id] = extractDefined(css);
}

// ─── 检查 A：模板盲区 ─────────────────────────────────────────────────────────
const templateGap = [...coreTokensSet]
  .filter((t) => isThemeWritable(t) && !templateTokens.has(t))
  .sort();

// ─── 检查 B：孤悬覆盖 ─────────────────────────────────────────────────────────
const orphaned = {}; // themeId -> [token]
for (const [id, tokens] of Object.entries(themes)) {
  const bad = [...tokens].filter((t) => !coreTokensSet.has(t)).sort();
  if (bad.length) orphaned[id] = bad;
}

// ─── 检查 D：越权覆盖 ─────────────────────────────────────────────────────────
const overreach = {}; // 来源 -> [token]
for (const [id, tokens] of Object.entries({ _template: templateTokens, ...themes })) {
  const bad = [...tokens].filter((t) => coreTokensSet.has(t) && !isWritable(t)).sort();
  if (bad.length) overreach[id] = bad;
}

// ─── 检查 C：主题缺失关键 token ───────────────────────────────────────────────
// "关键 token" = 模板中列出的、且属于视觉范围的 token
const keyTokens = [...templateTokens].filter(isThemeWritable).sort();
const missing = {}; // themeId -> [token]
for (const [id, tokens] of Object.entries(themes)) {
  const lack = keyTokens.filter((t) => !tokens.has(t));
  if (lack.length) missing[id] = lack;
}

// ─── 输出 ─────────────────────────────────────────────────────────────────────
let hasError = false;

// ── A ──
if (templateGap.length > 0) {
  hasError = true;
  console.log(`\n✖  [A] 模板盲区：内核定义但模板未列出的视觉 token（主题作者无从覆盖）`);
  console.log(`   共 ${templateGap.length} 个：\n`);
  for (const t of templateGap) {
    // 找出是哪个 core 文件定义的
    const src = CORE_FILES.map((f) => path.relative(ROOT, f)).find(
      (_, i) => extractDefined(readCss(CORE_FILES[i])).has(t)
    ) ?? '?';
    console.log(`   ${t}   (定义于 ${src})`);
  }
}

// ── B ──
for (const [id, tokens] of Object.entries(orphaned)) {
  hasError = true;
  console.log(`\n✖  [B] 孤悬覆盖（themes/${id}/theme.css）：覆盖了内核不存在的 token`);
  console.log(`   共 ${tokens.length} 个：\n`);
  for (const t of tokens) console.log(`   ${t}`);
}

// ── D ──
for (const [id, tokens] of Object.entries(overreach)) {
  hasError = true;
  console.log(`\n✖  [D] 越权覆盖（themes/${id}/theme.css）：这些 token 由核心从基础色推导，主题不写，改写 --we-base-* 或白名单里的质感旋钮`);
  console.log(`   共 ${tokens.length} 个：\n`);
  for (const t of tokens) console.log(`   ${t}`);
}

// ── C ──
for (const [id, tokens] of Object.entries(missing)) {
  const pct = Math.round(((keyTokens.length - tokens.length) / keyTokens.length) * 100);
  console.log(`\nℹ  [C] 主题缺失（themes/${id}/theme.css）：模板关键 token 覆盖率 ${pct}%，缺少 ${tokens.length} 个`);
  for (const t of tokens) console.log(`   ${t}`);
}

// ── 汇总 ──
console.log(`\n─────────────────────────────────────────────────────────`);
console.log(`内核 token  (主题可写): ${[...coreTokensSet].filter(isThemeWritable).length}`);
console.log(`模板 token  (主题可写): ${[...templateTokens].filter(isThemeWritable).length}`);
for (const [id, tokens] of Object.entries(themes)) {
  const vis = [...tokens].filter(isThemeWritable).length;
  const pct = Math.round((vis / keyTokens.length) * 100);
  console.log(`${orphaned[id] || overreach[id] ? '✖' : '✓'} themes/${id}  : 覆盖 ${vis} 个视觉 token，关键覆盖率 ${pct}%`);
}

if (!hasError) {
  console.log(`\n✓ 三层对齐检查通过：模板覆盖全部主题可写 token，主题没有孤悬或越权覆盖。`);
}

process.exit(hasError ? 1 : 0);
