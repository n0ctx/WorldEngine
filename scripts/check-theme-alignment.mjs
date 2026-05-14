#!/usr/bin/env node
/**
 * 主题系统三层对齐检查
 *
 * 检查三个问题：
 *   A. 模板盲区   — 内核定义的视觉 token 在 _template/theme.css 里看不到，主题作者无从覆盖
 *   B. 孤悬覆盖   — 主题包覆盖了内核里根本不存在的 token（可能是改名后遗留）
 *   C. 主题缺失   — 模板列出的关键 token 某主题没有覆盖（不强制，仅提示）
 *
 * 退出码：
 *   0 — 全部通过
 *   1 — 发现 B 类孤悬覆盖（硬错误，token 完全无效）
 *   2 — 仅有 A 类模板盲区 / C 类主题缺失（警告，不阻塞 CI）
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── 路径配置 ────────────────────────────────────────────────────────────────
const CORE_FILES = [
  path.join(ROOT, 'frontend/src/themes/tokens.css'),
  path.join(ROOT, 'frontend/src/themes/fonts.css'),
];
const TEMPLATE_FILE = path.join(ROOT, 'themes/_template/theme.css');
const THEMES_DIR = path.join(ROOT, 'themes');

// ─── 不属于"主题视觉 token"范围，排除出 A/C 检查 ───────────────────────────
const SKIP_PREFIXES = [
  '--we-core-',        // 内部基础色，不对外暴露
  '--we-z-',           // z-index，不在主题范围
  '--we-space-',       // 间距，结构性，主题不改
  '--we-range-',       // 功能性渐变（JS 动态变量）
  '--we-status-table-',// JS 运行时 token
  '--we-worlds-grid-', // JS 运行时 token
  '--we-worlds-visible-',
  '--we-worlds-card-',
  '--we-duration-',    // 动效（主题可选覆盖，不强制）
  '--we-easing-',      // 动效缓动
  '--we-leading-',     // 排版阶梯（模板里已有注释占位）
  '--we-text-',        // 字号阶梯
  '--we-tracking-',    // 字距阶梯
  '--we-focus-ring',   // 通用焦点环，通常不需主题定制
  '--we-color-avatar-placeholder', // 业务色，很少主题化
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

function themeIds() {
  return readdirSync(THEMES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name);
}

// ─── 解析 ─────────────────────────────────────────────────────────────────────
const coreTokens = new Set();
for (const f of CORE_FILES) coreTokens.add(...[...extractDefined(readCss(f))]);
// Set.add 不支持展开，逐个加
const coreTokensSet = new Set();
for (const f of CORE_FILES) for (const t of extractDefined(readCss(f))) coreTokensSet.add(t);

const templateTokens = extractDefined(readCss(TEMPLATE_FILE));

const themes = {};
for (const id of themeIds()) {
  const css = readCss(path.join(THEMES_DIR, id, 'theme.css'));
  themes[id] = extractDefined(css);
}

// ─── 检查 A：模板盲区 ─────────────────────────────────────────────────────────
const templateGap = [...coreTokensSet]
  .filter((t) => isVisual(t) && !templateTokens.has(t))
  .sort();

// ─── 检查 B：孤悬覆盖 ─────────────────────────────────────────────────────────
const orphaned = {}; // themeId -> [token]
for (const [id, tokens] of Object.entries(themes)) {
  const bad = [...tokens].filter((t) => !coreTokensSet.has(t)).sort();
  if (bad.length) orphaned[id] = bad;
}

// ─── 检查 C：主题缺失关键 token ───────────────────────────────────────────────
// "关键 token" = 模板中列出的、且属于视觉范围的 token
const keyTokens = [...templateTokens].filter(isVisual).sort();
const missing = {}; // themeId -> [token]
for (const [id, tokens] of Object.entries(themes)) {
  const lack = keyTokens.filter((t) => !tokens.has(t));
  if (lack.length) missing[id] = lack;
}

// ─── 输出 ─────────────────────────────────────────────────────────────────────
let hasError = false;
let hasWarn  = false;

// ── A ──
if (templateGap.length > 0) {
  hasWarn = true;
  console.log(`\n⚠  [A] 模板盲区：内核定义但模板未列出的视觉 token（主题作者无从覆盖）`);
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

// ── C ──
for (const [id, tokens] of Object.entries(missing)) {
  hasWarn = true;
  const pct = Math.round(((keyTokens.length - tokens.length) / keyTokens.length) * 100);
  console.log(`\n⚠  [C] 主题缺失（themes/${id}/theme.css）：模板关键 token 覆盖率 ${pct}%，缺少 ${tokens.length} 个`);
  for (const t of tokens) console.log(`   ${t}`);
}

// ── 汇总 ──
console.log(`\n─────────────────────────────────────────────────────────`);
console.log(`内核 token  (视觉范围): ${[...coreTokensSet].filter(isVisual).length}`);
console.log(`模板 token  (视觉范围): ${[...templateTokens].filter(isVisual).length}`);
for (const [id, tokens] of Object.entries(themes)) {
  const vis = [...tokens].filter(isVisual).length;
  const pct = Math.round((vis / keyTokens.length) * 100);
  const ok = !orphaned[id] && !missing[id];
  console.log(`${ok ? '✓' : '⚠'} themes/${id}  : 覆盖 ${vis} 个视觉 token，关键覆盖率 ${pct}%`);
}

if (!hasError && !hasWarn) {
  console.log(`\n✓ 三层对齐检查通过，内核 / 模板 / 主题无漂移。`);
}

process.exit(hasError ? 1 : hasWarn ? 2 : 0);
