export const THINK_TAG_RE = /<\s*(\/?)\s*think(?:ing)?\s*>/gi;

function pushText(blocks, content) {
  const trimmed = content.replace(/^\n+/, '');
  if (trimmed) blocks.push({ type: 'text', content: trimmed, open: false });
}

// 栈式深度计数:嵌套平衡时返回 blocks;EOF 仍未归零返回 null。
function stackParse(source) {
  const blocks = [];
  let cursor = 0;
  let depth = 0;
  let current = '';
  for (const match of source.matchAll(THINK_TAG_RE)) {
    const token = match[0];
    const isClose = Boolean(match[1]);
    const index = match.index ?? 0;
    current += source.slice(cursor, index);
    cursor = index + token.length;
    if (depth === 0) {
      if (isClose) { current += token; continue; }
      pushText(blocks, current);
      current = '';
      depth = 1;
      continue;
    }
    if (isClose) {
      depth -= 1;
      if (depth > 0) { current += token; continue; }
      blocks.push({ type: 'thinking', content: current, open: false });
      current = '';
      continue;
    }
    depth += 1;
    current += token;
  }
  current += source.slice(cursor);
  if (depth > 0) return null;
  pushText(blocks, current);
  return blocks;
}

// 流式中 EOF 失衡保持栈式语义(open thinking),避免在两开一闭出现于流中段时被误判为闭合,
// 等下一帧补齐外层 </think> 时已渲染的 text 又被吸回 thinking 块导致闪烁。
function stackParseStreaming(source) {
  const blocks = [];
  let cursor = 0;
  let depth = 0;
  let current = '';
  for (const match of source.matchAll(THINK_TAG_RE)) {
    const token = match[0];
    const isClose = Boolean(match[1]);
    const index = match.index ?? 0;
    current += source.slice(cursor, index);
    cursor = index + token.length;
    if (depth === 0) {
      if (isClose) { current += token; continue; }
      pushText(blocks, current);
      current = '';
      depth = 1;
      continue;
    }
    if (isClose) {
      depth -= 1;
      if (depth > 0) { current += token; continue; }
      blocks.push({ type: 'thinking', content: current, open: false });
      current = '';
      continue;
    }
    depth += 1;
    current += token;
  }
  current += source.slice(cursor);
  if (depth > 0) {
    blocks.push({ type: 'thinking', content: current, open: true });
  } else {
    pushText(blocks, current);
  }
  return blocks;
}

// 终态兜底:首个 </think> 即闭合外层,内层 <think> 当文本。修复模型输出"两开一闭"时整段被吞为 thinking 的 bug。
// 仅在非流式(终态)调用,避免流式中频繁回退引发块结构跳变。
function booleanParse(source) {
  const blocks = [];
  let inThink = false;
  let current = '';
  let cursor = 0;
  for (const match of source.matchAll(THINK_TAG_RE)) {
    const token = match[0];
    const isClose = Boolean(match[1]);
    const index = match.index ?? 0;
    current += source.slice(cursor, index);
    cursor = index + token.length;
    if (!inThink) {
      if (isClose) { current += token; continue; }
      pushText(blocks, current);
      current = '';
      inThink = true;
      continue;
    }
    if (isClose) {
      blocks.push({ type: 'thinking', content: current, open: false });
      current = '';
      inThink = false;
      continue;
    }
    current += token;
  }
  current += source.slice(cursor);
  if (inThink) {
    blocks.push({ type: 'thinking', content: current, open: true });
  } else {
    pushText(blocks, current);
  }
  return blocks;
}

export function parseStreamingBlocks(text, opts) {
  const source = text || '';
  const isStreaming = Boolean(opts?.isStreaming);
  const result = isStreaming
    ? stackParseStreaming(source)
    : (stackParse(source) ?? booleanParse(source));
  return result.length > 0 ? result : [{ type: 'text', content: source, open: false }];
}
