/**
 * 硬编码字面量守卫的检测部分：CSS 声明与 JS style 对象 / className 里的值分析
 *
 * 由 check-literals.mjs 调用；规则说明与用法见那份脚本的头部注释。
 */

import { valueLeaves, walk } from './guard-common.mjs';
import { isTailwindLiteral, utilityOf } from './literals-tailwind.mjs';

// ─── 值分析（CSS 声明与 JS style 共用） ───────────────────────────────────────
const HEX_RE = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-z_-])/gi;
const COLOR_FN_RE = /(?<![\w-])(rgba?|hsla?|oklch)\(/gi;
const NAMED_COLOR_RE = /(?<![\w-])(white|black)(?![\w-])/gi;
const COLOR_PROP_RE = /color|^background|^border|^outline|shadow|^fill$|^stroke$|filter|mask/;
const SHADOW_PROPS = new Set(['box-shadow', 'text-shadow', '-webkit-box-shadow']);
const FILTER_PROPS = new Set(['filter', 'backdrop-filter', '-webkit-backdrop-filter']);
const RADIUS_RE = /^border(-[a-z]+)*-radius$/;
const MASK_PROP_RE = /^(-webkit-)?mask/;
const MASK_ALPHA_COLORS = new Set(['#000', '#000000', 'black']);
const collapse = (text) => text.replace(/\s+/g, ' ').trim();

// open 是 '(' 的下标；返回配对的 ')' 下标，找不到返回 -1
function matchParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')' && (depth -= 1) === 0) return i;
  }
  return -1;
}

function topLevelComma(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') depth -= 1;
    else if (text[i] === ',' && depth === 0) return i;
  }
  return -1;
}

// 找出 name(...) 调用，返回 { inners: 括号内文本列表, rest: 去掉这些调用后的文本 }
function extractCalls(text, name) {
  const re = new RegExp(`(?<![\\w-])${name}\\(`, 'gi');
  const inners = [];
  let rest = '';
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(text, open);
    if (close === -1) break;
    inners.push(text.slice(open + 1, close));
    rest += text.slice(last, m.index);
    last = close + 1;
    re.lastIndex = last;
  }
  return { inners, rest: rest + text.slice(last) };
}

const isLiteralFallback = (text) => /#[0-9a-f]{3,8}\b|\d|(?<![\w-])(rgba?|hsla?|oklch)\(/i
  .test(text.replace(/var\([^()]*\)/g, ''));

// 把每个 var(name, 回退) 改写成 var(name)；--we-* 的字面量回退记进 found
function stripFallbacks(value, found) {
  let out = '';
  let i = 0;
  while (i < value.length) {
    const at = value.indexOf('var(', i);
    if (at === -1 || /[\w-]/.test(value[at - 1] ?? ' ')) {
      const next = at === -1 ? value.length : at + 4;
      out += value.slice(i, next);
      i = next;
      continue;
    }
    const close = matchParen(value, at + 3);
    if (close === -1) break;
    const inner = value.slice(at + 4, close);
    const comma = topLevelComma(inner);
    out += value.slice(i, at);
    if (comma === -1) out += `var(${inner})`;
    else {
      const name = inner.slice(0, comma).trim();
      const fallback = collapse(stripFallbacks(inner.slice(comma + 1), found));
      if (name.startsWith('--we-') && isLiteralFallback(fallback)) found.push(fallback);
      out += `var(${name})`;
    }
    i = close + 1;
  }
  return out + value.slice(i);
}

function colorLiterals(text, named) {
  const out = [...text.matchAll(HEX_RE)].map((m) => m[0].toLowerCase());
  for (const m of text.matchAll(COLOR_FN_RE)) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(text, open);
    const inner = close === -1 ? '' : text.slice(open + 1, close);
    if (close !== -1 && !inner.includes('var(')) out.push(`${m[1].toLowerCase()}(${collapse(inner.replace(/\s*,\s*/g, ',')).toLowerCase()})`);
  }
  if (named) out.push(...[...text.matchAll(NAMED_COLOR_RE)].map((m) => m[0].toLowerCase()));
  return out;
}

const nonZero = (n) => parseFloat(n) !== 0;

function sizeLiterals(text, units) {
  return [...text.matchAll(new RegExp(`(?<![\\w.-])(-?\\d*\\.?\\d+)(${units})(?![\\w-])`, 'g'))].filter((m) => nonZero(m[1]));
}

// prop 是小写连字符形式；返回 [{ rule, value }]
function analyzeValue(prop, rawValue) {
  const found = [];
  const fallbacks = [];
  const text = collapse(stripFallbacks(rawValue, fallbacks).replace(/!important/i, ''));
  fallbacks.forEach((value) => found.push({ rule: 'fallback', value }));
  for (const m of text.matchAll(/var\(\s*(--we-(?:base|core)-[\w-]+)/g)) found.push({ rule: 'layer', value: m[1] });

  const plain = extractCalls(text, 'url').rest.replace(/"[^"]*"|'[^']*'/g, '');
  const hasVar = plain.includes('var(');
  const named = COLOR_PROP_RE.test(prop) || /color-mix\(/i.test(plain);
  const mask = (list) => (MASK_PROP_RE.test(prop) ? list.filter((c) => !MASK_ALPHA_COLORS.has(c)) : list);
  const add = (rule, values) => values.forEach((value) => found.push({ rule, value }));

  if (SHADOW_PROPS.has(prop)) add('shadow', colorLiterals(plain, true));
  else if (FILTER_PROPS.has(prop)) {
    const { inners, rest } = extractCalls(plain, 'drop-shadow');
    add('shadow', inners.flatMap((inner) => colorLiterals(inner, true)));
    add('color', colorLiterals(rest, true));
  } else add('color', mask(colorLiterals(plain, named)));

  if (prop === 'font-size' && !hasVar) add('font-size', sizeLiterals(plain, 'px|rem').length ? [plain] : []);
  else if (prop === 'line-height' && !hasVar && /^-?\d*\.?\d+(px|rem)?$/.test(plain) && nonZero(plain)) add('line-height', [plain]);
  else if (prop === 'letter-spacing' && !hasVar) add('letter-spacing', sizeLiterals(plain, 'em|px|rem').length ? [plain] : []);
  else if (RADIUS_RE.test(prop) && !hasVar) add('radius', sizeLiterals(plain, 'px|rem').length ? [plain] : []);
  else if (prop === 'z-index' && /^-?\d+$/.test(plain)) add('z-index', [plain]);
  return found;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────
// 按 ; 与 } 切出声明，{ 结尾的是选择器 / at-rule 前导，跳过；括号与引号内的分隔符不算。
// 返回 { declarations: [{ prop, value, line }], balanced }
function scanCssDeclarations(text) {
  const declarations = [];
  let depth = 0;
  let parens = 0;
  let quote = null;
  let start = 0;
  let line = 1;
  let startLine = 1;
  const flush = (end) => {
    const segment = text.slice(start, end);
    const trimmed = segment.trim();
    const colon = trimmed.indexOf(':');
    if (trimmed && !trimmed.startsWith('@') && colon > 0) {
      const prop = trimmed.slice(0, colon).trim().toLowerCase();
      if (/^-{0,2}[a-z][\w-]*$/.test(prop)) {
        const lead = segment.length - segment.trimStart().length;
        const leadLines = segment.slice(0, lead).split('\n').length - 1;
        declarations.push({ prop, value: trimmed.slice(colon + 1).trim(), line: startLine + leadLines });
      }
    }
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\n') line += 1;
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') parens += 1;
    else if (ch === ')') parens -= 1;
    else if (parens === 0 && (ch === '{' || ch === ';' || ch === '}')) {
      if (ch !== '{') flush(i);
      if (ch === '{') depth += 1;
      if (ch === '}') depth -= 1;
      start = i + 1;
      startLine = line;
    }
  }
  return { declarations, balanced: depth === 0 && parens === 0 && !quote };
}

export function scanCssFile({ rel, text, comments }, allow, found) {
  const { declarations, balanced } = scanCssDeclarations(text);
  for (const { prop, value, line } of declarations) {
    for (const hit of analyzeValue(prop, value)) {
      if (!allow.covers(rel, line)) found.push({ rel, ...hit });
    }
  }
  const problems = [];
  if (!balanced || comments.some((c) => c.unterminated)) problems.push(`${rel} 的花括号、括号、引号或注释没有配对，CSS 无法完整扫描`);
  else if (declarations.length === 0) problems.push(`${rel} 没有识别出任何声明，CSS 扫描可能失效`);
  return problems;
}

// ─── JS / JSX ────────────────────────────────────────────────────────────────
const STYLE_KEY_RE = new RegExp('^(-webkit-)?(color|background|border|outline|fill|stroke|box-shadow|text-shadow|filter|backdrop-filter'
  + '|caret-color|accent-color|font-size|line-height|letter-spacing|z-index|mask|text-decoration-color|--)');
const PX_NUMBER_PROPS = /^(font-size|letter-spacing|border(-[a-z]+)*-radius)$/;

const kebab = (key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function keyName(prop) {
  if (prop.computed) return null;
  if (prop.key.type === 'Identifier') return prop.key.name;
  return typeof prop.key.value === 'string' ? prop.key.value : null;
}

function analyzeStyleValue(prop, node, rel, allow, found) {
  const line = node.loc.start.line;
  for (const leaf of valueLeaves(node)) {
    const value = typeof leaf === 'number' && PX_NUMBER_PROPS.test(prop) ? `${leaf}px` : String(leaf);
    for (const hit of analyzeValue(prop, value)) {
      if (!allow.covers(rel, line)) found.push({ rel, ...hit });
    }
  }
}

function analyzeClassString(text, line, rel, allow, found) {
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const utility = utilityOf(token);
    const hits = analyzeValue('class', utility).filter((h) => h.rule === 'layer' || h.rule === 'fallback');
    if (isTailwindLiteral(utility)) hits.push({ rule: 'tailwind', value: utility });
    for (const hit of hits) if (!allow.covers(rel, line)) found.push({ rel, ...hit });
  }
}

function classNameStrings(valueNode) {
  const out = [];
  for (const [node] of walk(valueNode)) {
    if (node.type === 'Literal' && typeof node.value === 'string') out.push({ text: node.value, line: node.loc.start.line });
    else if (node.type === 'TemplateElement') out.push({ text: node.value.cooked ?? '', line: node.loc.start.line });
  }
  return out;
}

// className 里的 Tailwind 字面量：JSX 的 className 属性，或对象里的 className 键
export function inspectClassName(node, rel, allow, found) {
  const isAttribute = node.type === 'JSXAttribute' && node.name.name === 'className' && node.value;
  const isProperty = node.type === 'Property' && keyName(node) === 'className';
  if (!isAttribute && !isProperty) return;
  const value = isProperty ? node.value : node.value.expression ?? node.value;
  for (const { text, line } of classNameStrings(value)) analyzeClassString(text, line, rel, allow, found);
}

// 对象里 CSS 属性名的键（style={{ ... }} 与其他样式对象）
export function inspectStyleProperty(node, rel, allow, found) {
  const name = node.type === 'Property' ? keyName(node) : null;
  if (name && STYLE_KEY_RE.test(kebab(name))) analyzeStyleValue(kebab(name), node.value, rel, allow, found);
}
