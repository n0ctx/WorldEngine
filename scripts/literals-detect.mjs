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
const MOTION_PROP_RE = /^(-webkit-)?(transition|animation)(-(duration|delay|timing-function))?$/;
const EASING_KEYWORD_RE = /(?<![\w-])(ease|ease-in|ease-out|ease-in-out|linear)(?![\w-])/g;
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

// 时长 / 延迟（非 0 的 ms、s）、cubic-bezier()、steps()、ease 类关键字
function motionLiterals(plain) {
  const out = [];
  let rest = plain;
  for (const name of ['cubic-bezier', 'steps']) {
    const { inners, rest: next } = extractCalls(rest, name);
    inners.forEach((inner) => out.push(`${name}(${collapse(inner.replace(/\s*,\s*/g, ','))})`));
    rest = next;
  }
  out.push(...sizeLiterals(rest, 'ms|s').map((m) => m[0]));
  out.push(...[...rest.matchAll(EASING_KEYWORD_RE)].map((m) => m[0]));
  return out;
}

// color-mix() 里各颜色后面跟的百分比字面量（含嵌套的 color-mix）；阶梯写法 var(--we-alpha-*) 不算
function mixPercentLiterals(text) {
  const out = [];
  for (const inner of extractCalls(text, 'color-mix').inners) {
    let rest = inner;
    for (let comma = topLevelComma(rest); comma !== -1 || rest; comma = topLevelComma(rest)) {
      const arg = (comma === -1 ? rest : rest.slice(0, comma)).trim();
      const pct = /\s(-?\d*\.?\d+%)$/.exec(arg);
      if (pct) out.push(pct[1]);
      out.push(...mixPercentLiterals(arg));
      rest = comma === -1 ? '' : rest.slice(comma + 1);
    }
  }
  return out;
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

  add('mix-percent', mixPercentLiterals(plain));

  if (prop === 'font-size' && !hasVar) add('font-size', sizeLiterals(plain, 'px|rem').length ? [plain] : []);
  else if (prop === 'line-height' && !hasVar && /^-?\d*\.?\d+(px|rem)?$/.test(plain) && nonZero(plain)) add('line-height', [plain]);
  else if (prop === 'letter-spacing' && !hasVar) add('letter-spacing', sizeLiterals(plain, 'em|px|rem').length ? [plain] : []);
  else if (RADIUS_RE.test(prop) && !hasVar) add('radius', sizeLiterals(plain, 'px|rem').length ? [plain] : []);
  else if (prop === 'font-weight' && /^(\d+|bold|bolder|lighter)$/.test(plain)) add('font-weight', [plain]);
  else if (prop === 'z-index' && /^-?\d+$/.test(plain)) add('z-index', [plain]);
  else if (prop === 'opacity' && !hasVar && !/^(0|1|inherit|initial|unset)$/.test(plain)) add('opacity', [plain]);
  else if (MOTION_PROP_RE.test(prop)) add('motion', motionLiterals(plain));
  return found;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────
// 按 ; 与 } 切出声明，{ 结尾的是选择器 / at-rule 前导，跳过；括号与引号内的分隔符不算。
// block 是声明所在规则块的序号（遇到第几个 {），同一规则块里的声明序号相同。
// 返回 { declarations: [{ prop, value, line, block }], balanced }
function scanCssDeclarations(text) {
  const declarations = [];
  let blocks = 0;
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
        declarations.push({ prop, value: trimmed.slice(colon + 1).trim(), line: startLine + leadLines, block: blocks });
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
      if (ch === '{') {
        depth += 1;
        blocks += 1;
      }
      if (ch === '}') depth -= 1;
      start = i + 1;
      startLine = line;
    }
  }
  return { declarations, balanced: depth === 0 && parens === 0 && !quote };
}

// 字体角色：字号取 --we-type-<角色>-size 时，同一规则块必须写齐同一角色的行高与字距（行高可用 --we-leading-flush）；
// 字号、行高、字距、字重里的 var() 只能是角色 / 图标 / 字重 token。em、%、calc()、inherit 等相对写法不管。
const TYPE_TOKEN_RE = {
  'font-size': /^var\(--we-(?:type-([a-z]+)-size|glyph-[a-z]+)\)$/,
  'line-height': /^var\(--we-(?:type-([a-z]+)-leading|leading-flush)\)$/,
  'letter-spacing': /^var\(--we-type-([a-z]+)-tracking\)$/,
  'font-weight': /^var\(--we-(?:type-[a-z]+-weight|weight-[a-z]+)\)$/,
};

export function scanCssTypeRoles({ rel, text }, allow, found) {
  for (const { line, value } of typeRoleHits(scanCssDeclarations(text).declarations)) {
    if (!allow.covers(rel, line)) found.push({ rel, rule: 'type-role', value });
  }
}

function typeRoleHits(declarations) {
  const hits = [];
  const blocks = Map.groupBy(declarations.filter((d) => TYPE_TOKEN_RE[d.prop]), (d) => d.block);
  for (const decls of blocks.values()) {
    const size = decls.find((d) => d.prop === 'font-size' && TYPE_TOKEN_RE['font-size'].exec(d.value)?.[1]);
    const role = size && TYPE_TOKEN_RE['font-size'].exec(size.value)[1];
    for (const d of decls.filter((item) => item.value.startsWith('var('))) {
      const match = TYPE_TOKEN_RE[d.prop].exec(collapse(d.value.replace(/!important/i, '')));
      if (!match) hits.push({ line: d.line, value: d.value });
      else if (role && match[1] && match[1] !== role) hits.push({ line: d.line, value: `${d.value} 与字号角色 ${role} 不一致` });
    }
    const missing = role ? ['line-height', 'letter-spacing'].filter((prop) => !decls.some((d) => d.prop === prop)) : [];
    missing.forEach((prop) => hits.push({ line: size.line, value: `${role} 角色缺 ${prop}` }));
  }
  return hits;
}

// 动效角色：transition / animation 的每一段，时长取 --we-motion-<角色>-duration 时必须配同一角色的 -easing；
// 循环角色的曲线由关键帧定，不查。只管核心样式，动效包的材质时长归包自己。
const ROLE_DURATION_RE = /var\(--we-motion-([a-z]+)-duration\)/;
const ROLE_EASING_RE = /var\(--we-motion-([a-z]+)-easing\)/;

export function scanCssMotionRoles({ rel, text }, allow, found) {
  for (const { prop, value, line } of scanCssDeclarations(text).declarations) {
    if ((prop !== 'transition' && prop !== 'animation') || allow.covers(rel, line)) continue;
    let rest = collapse(value.replace(/!important/i, ''));
    for (let comma = topLevelComma(rest); rest; comma = topLevelComma(rest)) {
      const segment = (comma === -1 ? rest : rest.slice(0, comma)).trim();
      rest = comma === -1 ? '' : rest.slice(comma + 1);
      const role = ROLE_DURATION_RE.exec(segment)?.[1];
      const easing = ROLE_EASING_RE.exec(segment)?.[1];
      let problem = null;
      if (role && role !== 'loop' && !easing) problem = `${role} 角色缺曲线`;
      else if (role && easing && role !== easing) problem = `时长 ${role} 配了曲线 ${easing}`;
      else if (!role && easing) problem = `曲线 ${easing} 没配同角色时长`;
      if (problem) found.push({ rel, rule: 'motion-role', value: `${segment}：${problem}` });
    }
  }
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
  + '|caret-color|accent-color|font-size|font-weight|line-height|letter-spacing|z-index|opacity|mask|text-decoration-color|transition|animation|--)');
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
