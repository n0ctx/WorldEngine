// 从前端样式中抽取 --we-* token 及默认值：开发环境读源码，打包环境读构建产物。

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fail } from './common.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SOURCE_DIRS = ['frontend/src/themes', 'frontend/dist/assets'];
const DECLARATION_RE = /(--we-[a-z0-9-]+)\s*:\s*([^;}]+)/g;

let cached = null;

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

export function loadTokens() {
  if (cached) return cached;
  cached = new Map();
  for (const rel of SOURCE_DIRS) {
    const dir = path.join(REPO_ROOT, rel);
    if (!existsSync(dir)) continue;
    // tokens.css 放在最前，保证取到的是核心层默认值
    const files = readdirSync(dir).filter((f) => f.endsWith('.css')).sort((a, b) => (a === 'tokens.css' ? -1 : b === 'tokens.css' ? 1 : 0));
    for (const file of files) {
      const css = stripComments(readFileSync(path.join(dir, file), 'utf-8'));
      for (const [, name, value] of css.matchAll(DECLARATION_RE)) {
        if (!cached.has(name)) cached.set(name, value.trim());
      }
    }
    if (cached.size > 0) break;
  }
  return cached;
}

export function renderTokenDoc() {
  const tokens = loadTokens();
  if (tokens.size === 0) return '当前环境读不到前端样式，无法列出 token。';
  const groups = new Map();
  for (const [name, value] of tokens) {
    const group = name.split('-').slice(0, 4).join('-');
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(`${name}: ${value}`);
  }
  const lines = ['# 可用 --we-* token（名称: 默认值）', ''];
  for (const [group, rows] of groups) lines.push(`## ${group}`, ...rows, '');
  return lines.join('\n');
}

function assertKnown(names) {
  const tokens = loadTokens();
  if (tokens.size === 0) return;
  const unknown = [...new Set(names)].filter((name) => !tokens.has(name));
  if (unknown.length > 0) fail(`不存在的 token：${unknown.join(', ')}。read("doc:theme-tokens") 查看可用 token`);
}

// 主题 CSS 只允许在 :root 下覆写已有 --we-* token。
export function assertThemeCss(css) {
  const body = stripComments(css);
  const rest = body.replace(/:root\s*\{[^{}]*\}/g, '').trim();
  if (rest) fail(`主题 CSS 只能包含 :root { --we-*: … } 变量覆盖，不能有其它选择器或 @ 规则。多余内容：${rest.slice(0, 80)}`);
  const declarations = [...body.matchAll(/:root\s*\{([^{}]*)\}/g)]
    .flatMap((m) => m[1].split(';'))
    .map((decl) => decl.split(':')[0].trim())
    .filter(Boolean);
  const nonToken = declarations.filter((name) => !name.startsWith('--we-'));
  if (nonToken.length > 0) fail(`主题 CSS 只能覆写 --we-* 变量，发现：${[...new Set(nonToken)].join(', ')}`);
  assertKnown(declarations);
}

// CSS 片段里引用或覆写的 --we-* token 必须真实存在。
export function assertSnippetTokens(css) {
  const body = stripComments(css);
  const names = [...body.matchAll(/--we-[a-z0-9-]+/g)].map((m) => m[0]);
  assertKnown(names);
}
