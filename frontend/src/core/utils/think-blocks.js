const THINK_TAG_RE = /<\s*(\/?)\s*think(?:ing)?\s*>/gi;

/**
 * 将文本拆成普通正文块和 think 块。
 * 进入 think 后，内部多出来的 <think> 与 </think> 都不再当作结构标签，只把最后一个 </think> 视为真正的闭合。
 */
export function parseStreamingBlocks(text) {
  const source = text || '';
  const matches = Array.from(source.matchAll(THINK_TAG_RE));
  const closeCounts = matches.map((m) => (m[1] ? 1 : 0));
  let remainingCloses = closeCounts.reduce((a, b) => a + b, 0);

  const blocks = [];
  let cursor = 0;
  let inThink = false;
  let current = '';

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const token = match[0];
    const isClose = Boolean(match[1]);
    const index = match.index ?? 0;
    current += source.slice(cursor, index);
    cursor = index + token.length;
    if (isClose) remainingCloses -= 1;

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
      if (remainingCloses > 0) {
        current += token;
        continue;
      }
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
