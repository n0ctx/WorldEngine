#!/usr/bin/env node
/**
 * 硬编码字面量守卫：视觉值该走 token 的地方写了字面量就报
 *
 * 扫描范围（frontend/src）：
 *   - CSS：themes/ui.css、pages.css、chat.css、themes/motion/*.css
 *   - JS/JSX（不含测试）：style 对象里的 CSS 属性、className 字符串
 *   不扫：themes/tokens.css、fonts.css、visual/<主题 id>/theme.css（那是 token 定义）、pages/DesignLabPage/（设计实验室）、
 *   测试文件；CSS 注释与 JS 注释里的内容不算；mask 属性里的 #000（取 alpha 通道）不算。
 *   JS 只看 CSS 属性名的键值和 className，色板 / 画布 / 取色文件里的颜色不在这些位置，无需整文件排除。
 *
 * 规则（基线按 文件 + 规则 + 值 计数，不按行号）：
 *   color          #hex、rgb()/rgba()/hsl()/hsla()/oklch()、作为颜色值的 white/black（color-mix 里出现同样报）
 *   layer          组件样式直接 var(--we-base-*) / var(--we-core-*)，越过语义层
 *   font-size      px / rem 字面量
 *   line-height    数字或 px / rem 字面量（0 与 normal 不报）
 *   letter-spacing 非 0 的 em / px / rem 字面量
 *   font-weight    数字与 bold / bolder / lighter 字面量
 *   type-role      字号取 --we-type-<角色>-size 的规则块没写齐同一角色的行高与字距，或混用了别的角色；
 *                  字号 / 行高 / 字距 / 字重里的 var() 不是角色、图标（--we-glyph-*）、--we-leading-flush、字重 token
 *   radius         border-radius（含各角）里非 0 的 px / rem 字面量（含 var() 的表达式不报）
 *   shadow         box-shadow / text-shadow / drop-shadow 里的颜色字面量
 *   z-index        整数字面量（var() 与 calc(var()) 不报）
 *   opacity        0 / 1 以外的字面量：弱化文字走文字色阶梯（--we-color-text-*），不可用控件用 --we-opacity-disabled；
 *                  动效包材质里有意保留的记入基线
 *   motion         transition / animation（含 -duration / -delay / -timing-function）里非 0 的 ms、s 时长与延迟、
 *                  cubic-bezier()、steps()、ease / linear 关键字，自定义属性（--x: ...）里的也算——
 *                  动效包的时间阶梯与曲线定义写 guard-allow；JS 里 framer-motion 的数字 duration / delay / 弹簧参数
 *                  也报（动效包与 core/utils/motion.js 除外），时长改用 useMotion().role()
 *   motion-role    核心样式（不含 themes/motion/）的 transition / animation 里，时长取 --we-motion-<角色>-duration 的一段
 *                  没配同一角色的 -easing，或只写了曲线没写同角色时长；循环角色不查曲线
 *   fallback       var(--we-x, 字面量) 里的字面量回退
 *   mix-percent    color-mix() 里的百分比字面量：半透明与混色浓度只取透明度阶梯 var(--we-alpha-*)，
 *                  超过一半时反过来写（另一侧的颜色取阶梯）；动效包材质里有意保留的记入基线
 *   tailwind       className 里的任意值 text-[12px] / rounded-[8px] / bg-[#fff] / tracking-[..] / leading-[..]，
 *                  以及内置刻度 text-sm、rounded-lg、tracking-wide、leading-tight、font-mono、font-bold、bg-white、opacity-50 等；
 *                  字号、行高、字距、字重一律用 .we-type-* 角色类，[font-size:..] / text-[length:..] 等写法即使引用 var() 也报
 *   primitive-class components/ui/ 以外的 className 手写基础控件的类（we-btn*）：按钮改用 Button / IconButton
 *   padding / margin / gap 不在本守卫范围。
 *
 * 有意保留：JS 在上一行写 `// guard-allow(literals): 理由`；CSS 把同样的 `guard-allow(literals): 理由` 写进块注释，
 * 紧贴在声明上一行。规则见 guard-common.mjs 头部。
 *
 * 基线 scripts/literals-baseline.json：新增或变多算失败，变少（含消失）算虚挂。
 *
 * 用法：
 *   node scripts/check-literals.mjs [--root <dir>] [--baseline <path>] [--update-baseline]
 *
 * 退出码：0 通过 / 1 存在违规
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BASELINE_NOTE, allowFailures, baselineFailures, collectAllowMarkers, collectFiles, compareCounts, countKeys, finish,
  isTestPath, loadBaseline, parseArgs, parseFiles, scanHealth, stripCssComments, walk, writeBaseline,
} from './guard-common.mjs';
import { inspectClassName, inspectStyleProperty, scanCssFile, scanCssMotionRoles, scanCssTypeRoles } from './literals-detect.mjs';

const SCRIPT = 'check-literals.mjs';
const DEFAULT_BASELINE = path.join('scripts', 'literals-baseline.json');
const SRC_DIR = 'frontend/src';
const CSS_FILES = new Set([
  'frontend/src/themes/ui.css', 'frontend/src/themes/pages.css', 'frontend/src/themes/chat.css',
]);
const CSS_DIRS = ['frontend/src/themes/motion/'];
const EXCLUDED_DIRS = ['frontend/src/pages/DesignLabPage/'];

const RULE_HINTS = {
  color: '颜色改用 `--we-color-*`（半透明用 color-mix 基于 token）',
  layer: '不要越过语义层，改用 `--we-color-*` 等语义 token',
  'font-size': '字号改用字体角色 `--we-type-<角色>-size`（字符图标用 `--we-glyph-*`）',
  'line-height': '行高改用字体角色 `--we-type-<角色>-leading`（单行居中用 `--we-leading-flush`）',
  'letter-spacing': '字距改用字体角色 `--we-type-<角色>-tracking`',
  'font-weight': '字重改用 `--we-weight-*` 或角色的 `--we-type-<角色>-weight`',
  'type-role': '同一规则块写齐同一角色的 `--we-type-<角色>-size / -leading / -tracking`',
  radius: '圆角改用 `--we-radius-*`',
  shadow: '阴影里的颜色改用 `--we-color-*`（或整体用 `--we-shadow-*`）',
  'z-index': '层级改用 `--we-z-*`',
  opacity: '弱化文字改用文字色阶梯 `--we-color-text-secondary / -tertiary / -faint`，不可用控件用 `--we-opacity-disabled`；显隐只用 0 / 1',
  motion: '时长与缓动改用动效角色（CSS `--we-motion-<角色>-duration / -easing`，JS `useMotion().role()`）；动效包的材质时长取本包时间阶梯，阶梯定义处写 guard-allow(literals)',
  'motion-role': '同一段过渡里时长与曲线取同一角色：`var(--we-motion-<角色>-duration) var(--we-motion-<角色>-easing)`',
  fallback: '去掉字面量回退，token 在 tokens.css 里声明即可',
  'mix-percent': 'color-mix 的百分比改用透明度阶梯 `var(--we-alpha-1..5)`（6/12/24/40/64%）；超过一半时把另一侧颜色写在前面取阶梯',
  tailwind: '文字用 .we-type-<角色> 类；其余改成引用 --we-* 的任意值，如 rounded-[var(--we-radius-md)]、bg-[var(--we-color-bg-surface)]',
  'primitive-class': '按钮改用 Button / IconButton（components/ui/），不要手写 we-btn 类',
};
const RULES = Object.keys(RULE_HINTS);

// ─── 汇总 ────────────────────────────────────────────────────────────────────
const isExcluded = (rel) => isTestPath(rel) || EXCLUDED_DIRS.some((dir) => rel.startsWith(dir));

function collectLiterals(root) {
  const cssRels = collectFiles(root, SRC_DIR, (name) => name.endsWith('.css'))
    .filter((rel) => CSS_FILES.has(rel) || CSS_DIRS.some((dir) => rel.startsWith(dir)));
  const jsRels = collectFiles(root, SRC_DIR, (name) => /\.jsx?$/.test(name)).filter((rel) => !isExcluded(rel));
  const { parsed, parseFailures } = parseFiles(root, jsRels);

  const found = [];
  const cssFiles = cssRels.map((rel) => {
    return { rel, ...stripCssComments(readFileSync(path.join(root, rel), 'utf8')) };
  });
  const allow = collectAllowMarkers(parsed, 'literals', cssFiles);
  const cssProblems = cssFiles.flatMap((file) => scanCssFile(file, allow, found));
  cssFiles.forEach((file) => scanCssTypeRoles(file, allow, found));
  cssFiles.filter((file) => !file.rel.includes('/themes/motion/')).forEach((file) => scanCssMotionRoles(file, allow, found));
  for (const file of parsed) {
    for (const [node] of walk(file.tree)) {
      inspectClassName(node, file.rel, allow, found);
      inspectStyleProperty(node, file.rel, allow, found);
    }
  }
  const counts = countKeys(found.map((f) => `${f.rel}::${f.rule}::${f.value}`));
  const byRule = countKeys(found.map((f) => f.rule));
  return {
    allow,
    counts: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1))),
    byRule,
    total: found.length,
    cssProblems,
    parseFailures,
    fileCount: cssRels.length + jsRels.length,
    parsedFileCount: cssRels.length - cssProblems.length + parsed.length,
    cssCount: cssRels.length,
    jsCount: jsRels.length,
  };
}

function describeKey(counts) {
  return (key) => {
    const [rel, rule, ...value] = key.split('::');
    const n = counts[key];
    return `${rel} [${rule}] ${value.join('::')}${n > 1 ? ` ×${n}` : ''} → ${RULE_HINTS[rule]}`;
  };
}

function ruleSummary(byRule) {
  return RULES.filter((rule) => byRule[rule]).map((rule) => `${rule} ${byRule[rule]}`).join('、') || '无';
}

// ─── CLI ─────────────────────────────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv.slice(2), DEFAULT_BASELINE);
  const scan = collectLiterals(args.root);
  const summary = `扫描 ${scan.cssCount} 个 CSS、${scan.jsCount} 个 JS/JSX 文件，硬编码字面量 ${scan.total} 处（${ruleSummary(scan.byRule)}）`;
  const healthFailures = [
    ...scanHealth({ ...scan, emptyMessage: `没有扫到任何文件（${SRC_DIR}），遍历逻辑可能坏了` }),
    ...scan.cssProblems,
  ];

  if (args.updateBaseline && healthFailures.length) {
    finish('硬编码字面量守卫', ['detector health 不通过', ...healthFailures], summary);
  }
  if (args.updateBaseline) {
    writeBaseline(args.baselinePath, { literals: scan.counts });
    console.log(`[literals] 基线已更新\nFile: ${path.relative(args.root, args.baselinePath)}\n${summary}写入基线`);
    process.exit(0);
  }

  const failures = [...healthFailures];
  let baseline;
  try {
    baseline = loadBaseline(args.baselinePath, { literals: {} });
  } catch (err) {
    finish('硬编码字面量守卫', [err.message], summary);
  }
  failures.push(...baselineFailures(compareCounts(scan.counts, baseline.literals || {}, { describe: describeKey(scan.counts) }), {
    script: SCRIPT, addedTitle: '这些硬编码字面量不在基线里；改用对应的 token',
  }));
  failures.push(...allowFailures(scan.allow));

  finish('硬编码字面量守卫', failures, summary, BASELINE_NOTE, scan.allow.listing());
}

main();
