export const THINK_TAG_RE = /<\s*(\/?)\s*think(?:ing)?\s*>/gi;

// 栈式深度计数:流式中间态外层未闭合时,内层 </think> 不会被误判为外层闭合。
export function parseStreamingBlocks(text) {
  const source = text || '';
  const matches = Array.from(source.matchAll(THINK_TAG_RE));

  const blocks = [];
  let cursor = 0;
  let depth = 0;
  let current = '';

  function pushText(content) {
    const trimmed = content.replace(/^\n+/, '');
    if (trimmed) blocks.push({ type: 'text', content: trimmed, open: false });
  }

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const token = match[0];
    const isClose = Boolean(match[1]);
    const index = match.index ?? 0;
    current += source.slice(cursor, index);
    cursor = index + token.length;

    if (depth === 0) {
      if (isClose) {
        current += token;
        continue;
      }
      pushText(current);
      current = '';
      depth = 1;
      continue;
    }

    if (isClose) {
      depth -= 1;
      if (depth > 0) {
        current += token;
        continue;
      }
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
    pushText(current);
  }

  return blocks.length > 0 ? blocks : [{ type: 'text', content: source, open: false }];
}
