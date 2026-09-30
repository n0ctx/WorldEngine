/**
 * 硬编码字面量守卫里的 Tailwind 判定：className 里的工具类是否写死了字号、圆角、字距、行高、字重、字体或颜色，
 * 或绕过字体角色类（.we-type-*）直接给字号、行高、字距、字重
 *
 * 由 literals-detect.mjs 调用；规则说明见 check-literals.mjs 头部注释。
 */

// 变体前缀（hover: / md: / dark: …）之后的工具类；方括号内的冒号不算变体分隔
export function utilityOf(token) {
  let depth = 0;
  let cut = 0;
  for (let i = 0; i < token.length; i += 1) {
    if (token[i] === '[') depth += 1;
    else if (token[i] === ']') depth -= 1;
    else if (token[i] === ':' && depth === 0) cut = i + 1;
  }
  return token.slice(cut).replace(/^!|!$/g, '').replace(/^-/, '');
}

// 任意值里的颜色字面量（含 var( 的已在调用前排除）
const COLOR_LITERAL_RE = /#[0-9a-f]{3,8}(?![\w-])|(?<![\w-])(rgba?|hsla?|oklch)\(/i;
const TW_ARBITRARY_RE = /^(text|rounded(?:-[a-z]{1,2})?|bg|border|fill|stroke|tracking|leading|opacity)-\[(.+)\]$/;
const TW_SCALES = [
  /^text-(xs|sm|base|lg|xl|[2-9]xl)$/,
  /^rounded(-(t|r|b|l|s|e|tl|tr|br|bl|ss|se|ee|es))?(-(xs|sm|md|lg|xl|[2-4]xl|full))?$/,
  /^tracking-(tighter|tight|normal|wide|wider|widest)$/,
  /^leading-(none|tight|snug|normal|relaxed|loose|\d+)$/,
  /^font-(mono|sans|serif)$/,
  /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/,
  /^(bg|text|border)-(black|white)(\/\d+)?$/,
  /^opacity-(?!0$|100$)\d+$/,
];

// 字号、行高、字距、字重一律经 .we-type-* 角色类，任意值写法（含 var()）都算
const TW_TYPE_PROPERTY_RE = /^\[(font-size|line-height|letter-spacing|font-weight|opacity):/;

export function isTailwindLiteral(utility) {
  if (TW_SCALES.some((re) => re.test(utility))) return true;
  if (TW_TYPE_PROPERTY_RE.test(utility)) return true;
  const m = TW_ARBITRARY_RE.exec(utility);
  if (!m) return false;
  const [, kind, inner] = m;
  if (kind === 'tracking' || kind === 'leading' || kind === 'opacity') return true;
  if (kind === 'text' && inner.startsWith('length:')) return true;
  if (inner.includes('var(')) return false;
  const sized = /^(length:)?-?\d*\.?\d+(px|rem)$/.test(inner);
  if (kind.startsWith('rounded')) return sized && parseFloat(inner.replace(/^length:/, '')) !== 0;
  if (kind === 'text' && sized) return true;
  return COLOR_LITERAL_RE.test(inner);
}
