export function findRegenerateSource(messages, assistantMsgId) {
  if (!Array.isArray(messages) || !assistantMsgId) return null;
  const assistantIdx = messages.findIndex((m) => m.id === assistantMsgId);
  if (assistantIdx <= 0) return null;

  for (let i = assistantIdx - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg) continue;
    if (msg.role === 'assistant') return null;
    if (msg.role === 'user' && msg.content) {
      return { index: i, message: msg };
    }
  }

  return null;
}
