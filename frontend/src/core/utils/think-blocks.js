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

// 兜底:首个 </think> 即闭合外层,内层 <think> 当文本。修复模型"两开一闭"时整段被吞为 thinking 的 bug。
// 流式与终态共用同一兜底——模型实际几乎不会输出良构嵌套,坚持栈式守卫只会让流式过程一直把
// </think> 后的正文错塞进思考块,等流结束才正确(用户实测反馈)。代价是良构嵌套场景下,
// 流尾补齐外层 </think> 那一帧会发生一次 text→thinking 的跳变,接受。
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

export function parseStreamingBlocks(text /* , opts */) {
  const source = text || '';
  const result = stackParse(source) ?? booleanParse(source);
  return result.length > 0 ? result : [{ type: 'text', content: source, open: false }];
}
