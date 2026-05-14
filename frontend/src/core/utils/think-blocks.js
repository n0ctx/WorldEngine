const THINK_TAG_RE = /<\s*(\/?)\s*think(?:ing)?\s*>/gi;

/**
 * 将文本拆成普通正文块和 think 块。
 * 进入 think 后，直到遇到第一个闭合标签前，都不再把内部 <think> 重新当作开标签解析。
 */
export function parseStreamingBlocks(text) {
  const source = text || '';
  const blocks = [];
  let cursor = 0;
  let inThink = false;
  let current = '';

  for (const match of source.matchAll(THINK_TAG_RE)) {
    const token = match[0];
    const isClose = Boolean(match[1]);
    const index = match.index ?? 0;
    current += source.slice(cursor, index);
    cursor = index + token.length;

    if (!inThink) {
      if (isClose) {
        current += token;
        continue;
      }
      const trimmed = current.replace(/^\n+/, '');
      if (trimmed) blocks.push({ type: 'text', content: trimmed, open: false });
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
    const trimmed = current.replace(/^\n+/, '');
    if (trimmed) blocks.push({ type: 'text', content: trimmed, open: false });
  }

  return blocks.length > 0 ? blocks : [{ type: 'text', content: source, open: false }];
}
