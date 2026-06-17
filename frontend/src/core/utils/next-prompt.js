import { THINK_TAG_RE } from './think-blocks.js';

const OPEN_TAG = '<think>';
const CLOSE_TAG = '</think>';
const NEXT_OPEN = '<next_prompt>';
const NEXT_CLOSE = '</next_prompt>';

// 与 parseStreamingBlocks 同语义:嵌套平衡走栈式,EOF depth>0 回退到首个 </think> 闭合(两开一闭兜底)。
// 两种模式都返回 spans = [{ srcStart, length, dstStart }],供 parseNextPromptStream 把 cleaned
// 偏移精确反推回原文偏移;避免老 findRawAnchor 对 prefix 再次 strip 与 full 的模式不一致(full=boolean
// + prefix=stack)导致长度对不上、display 退回 raw 把 <next_prompt> 字面标签泄漏到聊天气泡的 bug。
function stackStrip(source, keepOpen = false) {
  const spans = [];
  let out = '';
  let cursor = 0;
  let depth = 0;
  const flush = (end) => {
    if (end > cursor) {
      spans.push({ srcStart: cursor, length: end - cursor, dstStart: out.length });
      out += source.slice(cursor, end);
    }
    cursor = end;
  };
  for (const match of source.matchAll(THINK_TAG_RE)) {
    const token = match[0];
    const isClose = Boolean(match[1]);
    const index = match.index ?? 0;
    if (depth === 0) {
      if (isClose) continue;
      flush(index);
      cursor = index + token.length;
      depth = 1;
      continue;
    }
    if (isClose) {
      depth -= 1;
      if (depth === 0) cursor = index + token.length;
      continue;
    }
    depth += 1;
  }
  if (depth > 0) {
    if (!keepOpen) return null;
    // 流式:外层 think 未闭合,从首个 <think> 到 EOF 整段视为 think 内,不 flush。
    // 其中的 <next_prompt> 不进入 stripped,避免 think 闭合前被当成正文选项提前渲染。
    return { stripped: out, spans };
  }
  flush(source.length);
  return { stripped: out, spans };
}

function booleanStrip(source) {
  const spans = [];
  let out = '';
  let cursor = 0;
  let inThink = false;
  const flush = (end) => {
    if (end > cursor) {
      spans.push({ srcStart: cursor, length: end - cursor, dstStart: out.length });
      out += source.slice(cursor, end);
    }
    cursor = end;
  };
  for (const match of source.matchAll(THINK_TAG_RE)) {
    const token = match[0];
    const isClose = Boolean(match[1]);
    const index = match.index ?? 0;
    if (!inThink) {
      if (isClose) continue;
      flush(index);
      cursor = index + token.length;
      inThink = true;
      continue;
    }
    if (isClose) {
      cursor = index + token.length;
      inThink = false;
    }
  }
  if (!inThink) flush(source.length);
  return { stripped: out, spans };
}

function scanStrip(text, isStreaming = false) {
  const source = text || '';
  // 流式:外层 think 未闭合时保持其内部(含 next_prompt)被剥除,禁止 boolean 兜底提前闭合 think。
  // 终态:沿用 stackStrip ?? booleanStrip。
  if (isStreaming) return stackStrip(source, true);
  return stackStrip(source) ?? booleanStrip(source);
}

function mapStrippedToSrc(spans, dstIdx) {
  if (dstIdx < 0) return -1;
  for (const sp of spans) {
    if (dstIdx >= sp.dstStart && dstIdx < sp.dstStart + sp.length) {
      return sp.srcStart + (dstIdx - sp.dstStart);
    }
  }
  const last = spans[spans.length - 1];
  if (last && dstIdx === last.dstStart + last.length) return last.srcStart + last.length;
  return -1;
}

/**
 * 解析流式文本中的 <next_prompt> 块。
 * - display: 原始文本中 <next_prompt> 之前的部分（保留 think 标签原样，由 MessageItem 折叠渲染）。
 * - options: 仅当 <next_prompt> 出现在 think/thinking 块之外时才返回选项；
 *   若 <next_prompt> 位于（已闭合或未闭合的）think 块内，视为模型思考残留，丢弃。
 * - 当存在多个 <next_prompt> 时，取 think 块之外的**最后一个**，避免模型中途吐一次草稿
 *   就把后续正文一刀切掉。
 */
export function parseNextPromptStream(text, isStreaming = false) {
  const raw = text || '';
  const { stripped, spans } = scanStrip(raw, isStreaming);
  const idxInCleaned = stripped.lastIndexOf(NEXT_OPEN);
  if (idxInCleaned === -1) return { display: raw, options: [] };
  const rawIdx = mapStrippedToSrc(spans, idxInCleaned);
  if (rawIdx < 0 || !raw.startsWith(NEXT_OPEN, rawIdx)) return { display: raw, options: [] };
  const display = raw.slice(0, rawIdx);
  const after = stripped.slice(idxInCleaned + NEXT_OPEN.length).replace(NEXT_CLOSE, '');
  const options = after.split('\n').map((s) => s.trim()).filter(Boolean);
  return { display, options };
}

/**
 * 剥除 think block 内的 <next_prompt> 标签，保留标签内文本内容，
 * 使其在 think 面板中以普通文本形式展示而非被隐藏。
 */
export function stripNextPromptBlocks(text) {
  return text
    .replace(/<\s*\/?\s*next_prompt\s*>/gi, '');
}

export function parseContinuationText(text) {
  const { display, options } = parseNextPromptStream(text);
  return { content: display, options };
}

export { OPEN_TAG, CLOSE_TAG, NEXT_OPEN, NEXT_CLOSE };
