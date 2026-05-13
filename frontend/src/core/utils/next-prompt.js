const OPEN_TAG = '<think>';
const CLOSE_TAG = '</think>';
const NEXT_OPEN = '<next_prompt>';
const NEXT_CLOSE = '</next_prompt>';

// 仅用于 .test() 存在性检查，不能带 g flag（g flag 会累积 lastIndex 导致跨调用状态泄漏）
const THINK_OPEN_RE = /<\s*think(?:ing)?\s*>/i;
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
 * - 当存在多个 <next_prompt> 时，取 think 块之外的**最后一个**，避免模型中途吐一次草稿
 *   就把后续正文一刀切掉。
 */
export function parseNextPromptStream(text) {
  const raw = text || '';
  const cleaned = stripThinkBlocks(raw);
  const idx = cleaned.lastIndexOf(NEXT_OPEN);
  if (idx === -1) return { display: raw, options: [] };
  const rawIdx = findRawAnchor(raw, idx);
  const display = rawIdx >= 0 ? raw.slice(0, rawIdx) : raw;
  const after = cleaned.slice(idx + NEXT_OPEN.length).replace(NEXT_CLOSE, '');
  const options = after.split('\n').map((s) => s.trim()).filter(Boolean);
  return { display, options };
}

/**
 * 从原文末尾向前扫描 <next_prompt> 位置，返回 stripThinkBlocks(prefix).length === idxInCleaned
 * 的那一个 —— 即剥除 think 块后位于 idxInCleaned 处的真实原文坐标。
 * 从末尾向前确保选中“最后一个非 think 内”的 <next_prompt>。
 */
function findRawAnchor(raw, idxInCleaned) {
  let from = raw.length;
  while (from >= 0) {
    const pos = raw.lastIndexOf(NEXT_OPEN, from);
    if (pos === -1) return -1;
    if (stripThinkBlocks(raw.slice(0, pos)).length === idxInCleaned) return pos;
    from = pos - 1;
  }
  return -1;
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
