const THINK_TAG_PATTERN = '<\\s*(\\/?)\\s*think(?:ing)?\\s*>';

// 每次调用新建带 /g 的正则:模块级共享实例的 lastIndex 会被 test/exec 之类的用法污染,
// 导致后续 matchAll 从半路开始匹配、静默吞掉前半段文本。
export function matchThinkTags(source) {
  return source.matchAll(new RegExp(THINK_TAG_PATTERN, 'gi'));
}

// 流式尾部可能停在还没收齐的半截标签上(`<`、`</th`、`<think` …)。
// 本地模型把 think 标签当普通 content token 吐出时会被切开,不裁掉就会当正文闪现一帧。
const PARTIAL_THINK_TAG_RE = /<\s*\/?\s*(?:t(?:h(?:i(?:n(?:k(?:i(?:n(?:g)?)?)?)?)?)?)?)?\s*$/i;

function pushText(blocks, content) {
  const trimmed = content.replace(/^\n+/, '');
  if (trimmed) blocks.push({ type: 'text', content: trimmed, open: false });
}

// 已闭合且内容为空的 think 块不出块:模型关闭推理时常吐 <think></think>,
// 否则每条消息顶上都会多一个点开全空的思考面板。
// 未闭合的空块要保留——流式首帧靠它撑起思考面板的加载态。
function pushThinking(blocks, content, open) {
  if (!open && !content.trim()) return;
  blocks.push({ type: 'thinking', content, open });
}

// 栈式深度计数:嵌套平衡时返回 blocks;EOF 仍未归零时——
//   keepOpen=false(终态):返回 null,交给 booleanParse 兜底(保留"两开一闭"修复)。
//   keepOpen=true(流式):把未闭合的整段作为单个 open thinking 块返回,
//     内部重复出现的 <think>/</think> 一律当纯文本,禁止外层 think 闭合前提前裂块。
function stackParse(source, keepOpen = false) {
  const blocks = [];
  let cursor = 0;
  let depth = 0;
  let current = '';
  for (const match of matchThinkTags(source)) {
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
      pushThinking(blocks, current, false);
      current = '';
      continue;
    }
    depth += 1;
    current += token;
  }
  current += source.slice(cursor);
  if (depth > 0) {
    if (!keepOpen) return null;
    // 流式:外层 think 尚未闭合,整段(含内部 think 标签字面量)作为单个 open thinking 块。
    pushThinking(blocks, current, true);
    return blocks;
  }
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
  for (const match of matchThinkTags(source)) {
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
      pushThinking(blocks, current, false);
      current = '';
      inThink = false;
      continue;
    }
    current += token;
  }
  current += source.slice(cursor);
  if (inThink) {
    pushThinking(blocks, current, true);
  } else {
    pushText(blocks, current);
  }
  return blocks;
}

export function parseStreamingBlocks(text, opts = {}) {
  const raw = text || '';
  const source = opts.isStreaming ? raw.replace(PARTIAL_THINK_TAG_RE, '') : raw;
  // 流式:外层 think 闭合前保持单个 open thinking 块,内部重复 <think>/</think> 一律当纯文本,
  //   禁止提前裂出正文/第二个 think(stackParse keepOpen)。
  // 终态:沿用 stackParse ?? booleanParse,保留良构嵌套走栈、"两开一闭"走 boolean 的兜底。
  const result = opts.isStreaming
    ? stackParse(source, true)
    : (stackParse(source) ?? booleanParse(source));
  return result.length > 0 ? result : [{ type: 'text', content: source, open: false }];
}

// 流式中最后一块还不是可挂光标的正文（正文还是空的、思考块已收起或被隐藏）时，光标单独占一行放在末尾
export function needsTrailingCaret(blocks, showThinking) {
  const last = blocks[blocks.length - 1];
  if (!last) return true;
  if (last.type === 'thinking') return !(showThinking && last.open);
  return !last.content;
}
