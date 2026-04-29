const OPEN_TAG = '<think>';
const CLOSE_TAG = '</think>';
const NEXT_OPEN = '<next_prompt>';
const NEXT_CLOSE = '</next_prompt>';

const THINK_OPEN_RE = /<\s*think(?:ing)?\s*>/gi;
const THINK_CLOSE_RE = /<\s*\/\s*think(?:ing)?\s*>/gi;
// 已闭合的 think/thinking 块，整段（含标签）替换掉
const THINK_CLOSED_BLOCK_RE = /<\s*think(?:ing)?\s*>[\s\S]*?<\s*\/\s*think(?:ing)?\s*>/gi;
// 未闭合的尾部 think 块：最后一个开标签到文本末尾
const THINK_OPEN_TAIL_RE = /<\s*think(?:ing)?\s*>[\s\S]*$/i;

/**
 * 把 think/thinking 块从文本中剥除，返回剥除后的纯正文。
 * - 已闭合块：连同标签一起删除
 * - 未闭合的尾部块：从最后一个未闭合开标签到末尾全部删除
 */
function stripThinkBlocks(text) {
  let cleaned = text.replace(THINK_CLOSED_BLOCK_RE, '');
  if (THINK_OPEN_RE.test(cleaned)) {
    cleaned = cleaned.replace(THINK_OPEN_TAIL_RE, '');
  }
  return cleaned;
}

/**
 * 解析流式文本中的 <next_prompt> 块。
 * - display: 原始文本中 <next_prompt> 之前的部分（保留 think 标签原样，由 MessageItem 折叠渲染）。
 * - options: 仅当 <next_prompt> 出现在 think/thinking 块之外时才返回选项；
 *   若 <next_prompt> 位于（已闭合或未闭合的）think 块内，视为模型思考残留，丢弃。
 */
export function parseNextPromptStream(text) {
  const raw = text || '';
  const cleaned = stripThinkBlocks(raw);
  const idx = cleaned.indexOf(NEXT_OPEN);
  if (idx === -1) return { display: raw, options: [] };
  const rawIdx = raw.indexOf(NEXT_OPEN, findRawAnchor(raw, cleaned, idx));
  const display = rawIdx >= 0 ? raw.slice(0, rawIdx) : raw;
  const after = cleaned.slice(idx + NEXT_OPEN.length).replace(NEXT_CLOSE, '');
  const options = after.split('\n').map((s) => s.trim()).filter(Boolean);
  return { display, options };
}

/**
 * cleaned 中 idx 之前的字符数对应原文中至少多少字符（用作 indexOf 的起点）。
 * 简化策略：直接从 0 开始用 indexOf 查找；如果该位置在 think 内（即 cleaned 与 raw 偏移不一致），
 * 则继续向后找下一个，直到找到不在 think 内的为止。
 */
function findRawAnchor(raw, cleaned, idxInCleaned) {
  let from = 0;
  while (from <= raw.length) {
    const pos = raw.indexOf(NEXT_OPEN, from);
    if (pos === -1) return -1;
    const before = raw.slice(0, pos);
    if (stripThinkBlocks(before).length === idxInCleaned) return pos;
    from = pos + 1;
  }
  return -1;
}

export { OPEN_TAG, CLOSE_TAG, NEXT_OPEN, NEXT_CLOSE };
