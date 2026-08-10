#!/usr/bin/env node
/**
 * 设计令牌健康检查
 *
 * 扫描 frontend/src 与 themes/ 下所有 CSS/JSX/JS 文件:
 *   - 提取所有 --we-* 声明 (LHS) 与 var(--we-*) 引用 (RHS)
 *   - 报告"孤儿引用"(被引用但任何地方都未声明的 token)
 *   - 报告"僵尸 token"(声明了但无任何引用的 token)
 *
 * 退出码:
 *   0 - 健康
 *   1 - 发现孤儿引用 (硬错误,阻塞 CI)
 *   2 - 仅僵尸 token (软警告,不阻塞,但 stderr 提示)
 *
 * JS/JSX 中通过 React style prop 内联设置的运行时 token (例如 WorldsPage 的
 * '--we-worlds-grid-columns': value) 视为声明,以避免误报。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const SCAN_ROOTS = [
  path.join(repoRoot, 'frontend', 'src'),
  path.join(repoRoot, 'themes'),
];
const SCAN_EXTENSIONS = new Set(['.css', '.jsx', '.js']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.vite']);

const TOKEN_RE = /--we-[a-z0-9-]+/g;
const DECL_RE = /(--we-[a-z0-9-]+)\s*:/g;            // CSS 声明 LHS
const JS_DECL_RE = /['"](--we-[a-z0-9-]+)['"]\s*:/g; // JS/JSX style prop
const USE_RE = /var\(\s*(--we-[a-z0-9-]+)/g;
// JS/JSX 里按下标拼接的 token 名,例如 `var(--we-danmaku-${n})`。
// 名字在运行时才成形,静态扫描解析不出具体 token,记成"前缀用法":
// 该前缀下所有已声明 token 都视为被引用,拼接出的残缺名不计入引用。
const PREFIX_USE_RE = /var\(\s*(--we-[a-z0-9-]*?)\$\{/g;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

const declared = new Map(); // token -> [file:line]
const used = new Map();     // token -> [file:line]
const prefixUses = new Map(); // 前缀 -> [file:line]

function record(map, token, file, line) {
  if (!map.has(token)) map.set(token, []);
  map.get(token).push(`${path.relative(repoRoot, file)}:${line}`);
}

const files = SCAN_ROOTS.flatMap((root) => walk(root));

for (const file of files) {
  const isCss = file.endsWith('.css');
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNo = i + 1;

    DECL_RE.lastIndex = 0;
    let m;
    while ((m = DECL_RE.exec(line))) {
      // 只把出现在行起始空白后的 `--we-x:` 视为声明,避免把 `var(--we-x:` 误判
      // (实际语法上不会出现,但严谨一些)
      if (isCss) record(declared, m[1], file, lineNo);
    }

    const dynamicPrefixes = [];
    if (!isCss) {
      JS_DECL_RE.lastIndex = 0;
      while ((m = JS_DECL_RE.exec(line))) {
        record(declared, m[1], file, lineNo);
      }

      PREFIX_USE_RE.lastIndex = 0;
      while ((m = PREFIX_USE_RE.exec(line))) {
        dynamicPrefixes.push(m[1]);
        record(prefixUses, m[1], file, lineNo);
      }
    }

    USE_RE.lastIndex = 0;
    while ((m = USE_RE.exec(line))) {
      // 拼接用法已按前缀记账,跳过它切出来的残缺名
      if (dynamicPrefixes.includes(m[1])) continue;
      record(used, m[1], file, lineNo);
    }
  }
}

const declaredSet = new Set(declared.keys());
const usedSet = new Set(used.keys());

// 前缀用法展开：把该前缀下所有已声明 token 标记为已引用。
// 一个前缀匹配不到任何声明,说明拼接目标整体缺失,和孤儿引用同等严重。
let deadPrefix = false;
for (const [prefix, locs] of prefixUses) {
  let matched = 0;
  for (const token of declaredSet) {
    if (!token.startsWith(prefix) || token === prefix) continue;
    usedSet.add(token);
    matched += 1;
  }
  if (matched === 0) {
    console.error(`\n✖ 动态 token 前缀 ${prefix}* 没有匹配到任何声明:`);
    for (const loc of locs) console.error(`    └─ ${loc}`);
    deadPrefix = true;
  }
}

const orphans = [...usedSet].filter((t) => !declaredSet.has(t)).sort();
const zombies = [...declaredSet].filter((t) => !usedSet.has(t)).sort();

let exitCode = deadPrefix ? 1 : 0;

if (orphans.length > 0) {
  console.error(`\n✖ 发现 ${orphans.length} 个孤儿 token 引用 (使用但未声明):\n`);
  for (const t of orphans) {
    console.error(`  ${t}`);
    for (const loc of used.get(t).slice(0, 3)) {
      console.error(`    └─ ${loc}`);
    }
    if (used.get(t).length > 3) {
      console.error(`    └─ ...(共 ${used.get(t).length} 处)`);
    }
  }
  exitCode = 1;
}

if (zombies.length > 0) {
  console.error(`\n⚠ 发现 ${zombies.length} 个僵尸 token (声明但无引用,可考虑删除):\n`);
  for (const t of zombies) {
    console.error(`  ${t}  (${declared.get(t)[0]})`);
  }
  if (exitCode === 0) exitCode = 2;
}

if (exitCode === 0) {
  console.log(`✓ CSS token 健康: ${declaredSet.size} 声明 / ${usedSet.size} 引用,无孤儿无僵尸。`);
} else if (exitCode === 2) {
  // 仅僵尸,不阻塞
  console.log(`\nCSS token 检查通过 (仅有僵尸警告)。`);
  exitCode = 0;
}

process.exit(exitCode);
