export function stripDialoguePrefix(raw, prefixes) {
  let text = raw ?? '';
  for (const prefix of prefixes) {
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length);
      break;
    }
  }
  return text;
}

export function stripTrailingStateBlocks(raw) {
  const segments = (raw ?? '').split('\n\n');
  while (segments.length > 1) {
    const last = segments[segments.length - 1];
    if (last.startsWith('[') && last.includes('状态]')) {
      segments.pop();
    } else {
      break;
    }
  }
  return segments.join('\n\n');
}

export function stripUserContext(raw) {
  return stripDialoguePrefix(stripTrailingStateBlocks(raw), ['{{user}}：', '用户：']);
}

export function stripAsstContext(raw) {
  return stripDialoguePrefix(stripTrailingStateBlocks(raw), ['{{char}}：', 'AI：']);
}

// think block 剥除（与前端 next-prompt.js 保持一致）
// 注意：THINK_OPEN_TEST_RE 不能带 g flag，否则 .test() 会累积 lastIndex 导致跨调用状态泄漏
const THINK_CLOSED_RE = /<\s*think(?:ing)?\s*>[\s\S]*?<\s*\/\s*think(?:ing)?\s*>/gi;
const THINK_OPEN_TEST_RE = /<\s*think(?:ing)?\s*>/i;
const THINK_OPEN_TAIL_RE = /<\s*think(?:ing)?\s*>[\s\S]*$/i;
// 单个 think 块匹配（用于提取内容，不带 g 以避免 lastIndex 副作用）
const THINK_SINGLE_RE = /<\s*think(?:ing)?\s*>([\s\S]*?)(?:<\s*\/\s*think(?:ing)?\s*>|$)/i;

export function stripThinkBlocksFromText(text) {
  let cleaned = text.replace(THINK_CLOSED_RE, '');
  if (THINK_OPEN_TEST_RE.test(cleaned)) {
    cleaned = cleaned.replace(THINK_OPEN_TAIL_RE, '');
  }
  return cleaned;
}

// 在原始文本中找到对应 stripped 文本中 idxInStripped 位置的 <next_prompt> 的原始偏移量
export function findRawNextPromptIdx(raw, idxInStripped) {
  let from = 0;
  while (from <= raw.length) {
    const pos = raw.indexOf('<next_prompt>', from);
    if (pos === -1) return -1;
    if (stripThinkBlocksFromText(raw.slice(0, pos)).length === idxInStripped) return pos;
    from = pos + 1;
  }
  return -1;
}

/**
 * 若整段文本完全被单个 <think>...</think> 包裹（外侧无实际内容），
 * 则提取并返回 think 块内部的内容；否则原样返回。
 *
 * 处理 DeepSeek 有时将正文也写入 reasoning_content 的 API 异常：
 * streaming 层在 delta.content 始终为空时会产生 <think>全部内容</think> 的输出，
 * 本函数在持久化前将其解包，确保消息正常保存和历史上下文不丢失。
 */
export function unwrapSoloThinkBlock(text) {
  if (!text?.trim()) return text;
  const outer = text
    .replace(THINK_CLOSED_RE, '')
    .replace(THINK_OPEN_TAIL_RE, '')
    .trim();
  if (outer) return text;
  const m = text.match(THINK_SINGLE_RE);
  return m?.[1] ?? text;
}

/**
 * 'closed' | 'truncated' | 'absent'
 * - closed: 有 <next_prompt> 与 </next_prompt>
 * - truncated: 仅有开标签
 * - absent: 完全缺失或只剩残片（如 <next_prom）
 * 入参应是已 strip think 块后的 visibleContent。
 */
export function classifyNextPromptBoundary(visibleContent) {
  const trimmed = (visibleContent ?? '').trimEnd();
  if (!trimmed) return 'absent';
  const openIdx = trimmed.indexOf('<next_prompt>');
  if (openIdx === -1) return 'absent';
  const closeIdx = trimmed.indexOf('</next_prompt>', openIdx);
  return closeIdx === -1 ? 'truncated' : 'closed';
}

/**
 * 从 AI 输出中提取 <next_prompt> 选项块并剥除该标签。
 * 先剥除 think 块再查找，避免 think 内的示例标签被误提取。
 * 兼容模型未输出闭合标签的情形（回退到匹配到字符串末尾）。
 * @param {string} text
 * @returns {{ content: string, options: string[] }}
 */
export function extractNextPromptOptions(text) {
  if (!text) return { content: text ?? '', options: [] };

  // 剥除 think 块后再查找，防止 think 内的 <next_prompt> 被误提取
  const stripped = stripThinkBlocksFromText(text);
  const npIdxInStripped = stripped.indexOf('<next_prompt>');
  if (npIdxInStripped === -1) {
    // 去 think 后无 <next_prompt>，无合法选项可提取。
    // 即使 think 内含 <next_prompt> 字面字符串也保留 think 块原样：
    // 历史回灌前 stripThinkBlocksFromText 会剥除 think；前端 ThinkBlock 用 stripNextPromptBlocks 屏蔽字面标签。
    return { content: text, options: [] };
  }

  // 映射回原始文本中的位置
  const rawNpIdx = findRawNextPromptIdx(text, npIdxInStripped);
  if (rawNpIdx === -1) return { content: text, options: [] };

  // 提取选项内容（优先匹配闭合标签，回退到字符串末尾）
  let inner;
  const closeIdx = text.indexOf('</next_prompt>', rawNpIdx);
  if (closeIdx !== -1) {
    inner = text.slice(rawNpIdx + '<next_prompt>'.length, closeIdx);
  } else {
    inner = text.slice(rawNpIdx + '<next_prompt>'.length);
  }

  const options = inner.split('\n').map((s) => s.trim()).filter(Boolean);
  const content = text.slice(0, rawNpIdx).replace(/\n+$/, '');
  return { content, options };
}
