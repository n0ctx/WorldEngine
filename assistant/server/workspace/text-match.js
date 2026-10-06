// 在一段文本里定位要替换的原文。先逐字匹配；逐字找不到时依次放宽，
// 放宽后的结果只有在调用方确认唯一（或明确要求全部替换）时才会被采用。

const FOLD_PAIRS = '，,。.：:；;！!？?（(）)【[】]“"”"‘\'’\'「"」"『"』"、,～~－-—-';
const FOLD = new Map();
for (let i = 0; i < FOLD_PAIRS.length; i += 2) FOLD.set(FOLD_PAIRS[i], FOLD_PAIRS[i + 1]);

// 全半角标点与弯引号折叠成同一个字符；逐字符映射，位置不变。
const fold = (text) => Array.from(text, (ch) => FOLD.get(ch) ?? ch).join('');
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const unescapeLiteral = (text) => text.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"');

function exactRanges(text, needle) {
  const ranges = [];
  if (!needle) return ranges;
  for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + needle.length)) ranges.push([i, i + needle.length]);
  return ranges;
}

// 忽略 needle 首尾空白与每行行尾空白。
function looseSpaceRanges(text, needle) {
  const lines = needle.trim().split('\n').map((line) => escapeRegExp(line.trimEnd()));
  if (lines.every((line) => !line)) return [];
  const pattern = new RegExp(lines.join('[ \\t]*\\n'), 'g');
  return Array.from(text.matchAll(pattern), (m) => [m.index, m.index + m[0].length]);
}

const LEVELS = [
  { note: null, find: exactRanges },
  { note: '忽略首尾与行尾空白', find: looseSpaceRanges },
  { note: '把 old_text 里字面的 \\n、\\" 还原后', find: (text, needle) => exactRanges(text, unescapeLiteral(needle)), unescape: true },
  { note: '忽略全半角标点与引号差异', find: (text, needle) => exactRanges(fold(text), fold(needle)) },
];

/**
 * @returns {{ ranges: Array<[number, number]>, note: string|null, unescape: boolean }}
 *   ranges 为空表示各级都没找到；note 非空表示是放宽后才匹配上的。
 */
function locate(text, needle) {
  for (const level of LEVELS) {
    const ranges = level.find(text, needle);
    if (ranges.length > 0) return { ranges, note: level.note, unescape: Boolean(level.unescape) };
  }
  return { ranges: [], note: null, unescape: false };
}

function replaceRanges(text, ranges, replacement) {
  let out = text;
  for (const [start, end] of [...ranges].reverse()) out = out.slice(0, start) + replacement + out.slice(end);
  return out;
}

/**
 * 把 text 里的 oldText 换成 newText。
 * @returns {{ text: string, count: number, note: string|null } | { count: number, hint?: string|null }}
 *   成功时带 text；count 为 0 表示没找到（hint 说明从哪里开始对不上），大于 1 且未带 text 表示出现多次而没有要求全部替换。
 */
export function replaceText(text, oldText, newText, replaceAll) {
  const found = locate(text, oldText);
  const count = found.ranges.length;
  if (count === 0) return { count, hint: describeDivergence(text, oldText) };
  if (count > 1 && !replaceAll) return { count };
  const replacement = found.unescape ? unescapeLiteral(newText) : newText;
  return { text: replaceRanges(text, found.ranges, replacement), count, note: found.note };
}

const PREVIEW_CHARS = 30;
const MIN_USEFUL_PREFIX = 8;

/** 各级都没找到时，指出 needle 从哪里开始和原文对不上；对上的部分太短时返回 null。 */
function describeDivergence(text, needle) {
  let low = 0;
  let high = needle.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (text.includes(needle.slice(0, mid))) low = mid;
    else high = mid - 1;
  }
  if (low < MIN_USEFUL_PREFIX) return null;
  const at = text.indexOf(needle.slice(0, low)) + low;
  const show = (value) => JSON.stringify(value.slice(0, PREVIEW_CHARS));
  return `old_text 的前 ${low} 个字符能对上，之后原文是 ${show(text.slice(at))}，而 old_text 是 ${show(needle.slice(low))}`;
}
