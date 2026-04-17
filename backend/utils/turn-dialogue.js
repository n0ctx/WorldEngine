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
