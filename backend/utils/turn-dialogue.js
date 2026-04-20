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

/**
 * 从 AI 输出中提取 <next_prompt> 选项块并剥除该标签。
 * 仅处理首个 <next_prompt>...</next_prompt> 块，支持任意行数的选项。
 * 兼容模型未输出闭合标签的情形（回退到匹配到字符串末尾）。
 * @param {string} text
 * @returns {{ content: string, options: string[] }}
 */
export function extractNextPromptOptions(text) {
  if (!text) return { content: text ?? '', options: [] };

  // 优先匹配有闭合标签的完整块
  let inner;
  const fullMatch = text.match(/<next_prompt>([\s\S]*?)<\/next_prompt>/);
  if (fullMatch) {
    inner = fullMatch[1];
  } else {
    // 回退：模型截断时无闭合标签，匹配到字符串末尾
    const openIdx = text.indexOf('<next_prompt>');
    if (openIdx === -1) return { content: text, options: [] };
    inner = text.slice(openIdx + '<next_prompt>'.length);
  }

  const options = inner.split('\n').map((s) => s.trim()).filter(Boolean);
  const content = text.slice(0, text.indexOf('<next_prompt>')).replace(/\n+$/, '');
  return { content, options };
}
