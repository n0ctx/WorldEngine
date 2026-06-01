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

// think block 剥除:栈式深度计数 + EOF 兜底布尔回退,与前端 next-prompt.js / think-blocks.js 保持一致。
// 栈式正确处理"模型回放 <think>/</think> 字面"这类良好嵌套（kimi-coding 回归),
// 失衡时(两开一闭等)回退到首个 </think> 即闭合,避免整段被错判为 think。
//
// 两种模式都在 spans 中记录"原文区段 → 剥除文本偏移"映射,供 extractNextPromptOptions
// 直接由 cleaned 偏移反推原文偏移,避免对 prefix 再次 strip 导致模式跳变(full=boolean,
// prefix=stack)、长度不等回退失败的 mode-divergence bug。
const THINK_TAG_RE = /<\s*(\/?)\s*think(?:ing)?\s*>/gi;

function stackScan(source) {
  const spans = [];
  let out = '';
  let cursor = 0;
  let depth = 0;
  let outerInnerStart = -1;
  let outerInner = null;
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
      outerInnerStart = cursor;
      continue;
    }
    if (isClose) {
      depth -= 1;
      if (depth === 0) {
        if (outerInner == null) outerInner = source.slice(outerInnerStart, index);
        cursor = index + token.length;
      }
      continue;
    }
    depth += 1;
  }
  if (depth > 0) return null;
  flush(source.length);
  return { stripped: out, outerInner, spans };
}

function booleanScan(source) {
  const spans = [];
  let out = '';
  let cursor = 0;
  let inThink = false;
  let outerInnerStart = -1;
  // 失衡兜底:outerInner 优先取首个 </think> 之前的内容并连带保留闭合标签,与栈式语义对齐,
  // 避免 unwrapSoloThinkBlock 把两开一闭还原成残缺 opener 后导致下游 re-strip 丢失内容。
  let outerInner = null;
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
      outerInnerStart = cursor;
      continue;
    }
    if (isClose) {
      if (outerInner == null) outerInner = source.slice(outerInnerStart, index + token.length);
      cursor = index + token.length;
      inThink = false;
    }
  }
  if (!inThink) flush(source.length);
  else if (outerInner == null) outerInner = source.slice(outerInnerStart);
  return { stripped: out, outerInner, spans };
}

function scanThinkBlocks(text) {
  const source = text ?? '';
  return stackScan(source) ?? booleanScan(source);
}

// 用 spans 把 cleaned 偏移反推回原文偏移;cleaned 末尾(idx == 总长)映射到最后一段的源端。
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

export function stripThinkBlocksFromText(text) {
  return scanThinkBlocks(text).stripped;
}

// 在原始文本中找到对应 stripped 文本中 idxInStripped 位置的 <next_prompt> 的原始偏移量。
// 用一次 scan 的 spans 反推,避免老实现对 prefix 再次 strip 与 full 的模式不一致导致 -1。
export function findRawNextPromptIdx(raw, idxInStripped) {
  if (idxInStripped < 0) return -1;
  const source = raw ?? '';
  const { spans } = scanThinkBlocks(source);
  const srcIdx = mapStrippedToSrc(spans, idxInStripped);
  if (srcIdx < 0 || !source.startsWith('<next_prompt>', srcIdx)) return -1;
  return srcIdx;
}

/**
 * 若整段文本完全被单个 <think>...</think> 包裹(外侧无实际内容),
 * 则提取并返回 think 块内部的内容;否则原样返回。
 *
 * 处理 DeepSeek 有时将正文也写入 reasoning_content 的 API 异常:
 * streaming 层在 delta.content 始终为空时会产生 <think>全部内容</think> 的输出,
 * 本函数在持久化前将其解包,确保消息正常保存和历史上下文不丢失。
 */
export function unwrapSoloThinkBlock(text) {
  if (!text?.trim()) return text;
  const { stripped, outerInner } = scanThinkBlocks(text);
  if (stripped.trim()) return text;
  return outerInner ?? text;
}

/**
 * 'closed' | 'truncated' | 'absent'
 * - closed: 有 <next_prompt> 与 </next_prompt>
 * - truncated: 仅有开标签
 * - absent: 完全缺失或只剩残片(如 <next_prom)
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
 * 先剥除 think 块再查找,避免 think 内的示例标签被误提取。
 * 兼容模型未输出闭合标签的情形(回退到匹配到字符串末尾)。
 * @param {string} text
 * @returns {{ content: string, options: string[] }}
 */
export function extractNextPromptOptions(text) {
  if (!text) return { content: text ?? '', options: [] };

  const { stripped, spans } = scanThinkBlocks(text);
  const npIdxInStripped = stripped.indexOf('<next_prompt>');
  if (npIdxInStripped === -1) {
    // 去 think 后无 <next_prompt>,无合法选项可提取。即使 think 内含字面 <next_prompt> 也保留 think 块原样:
    // 历史回灌前 stripThinkBlocksFromText 会剥除 think;前端 ThinkBlock 用 stripNextPromptBlocks 屏蔽字面标签。
    return { content: text, options: [] };
  }

  const rawNpIdx = mapStrippedToSrc(spans, npIdxInStripped);
  if (rawNpIdx === -1 || !text.startsWith('<next_prompt>', rawNpIdx)) {
    return { content: text, options: [] };
  }

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
