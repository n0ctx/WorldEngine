export function setSseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

export function sendSse(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function beginStreamSession(sessionId, res, activeStreams) {
  const existing = activeStreams.get(sessionId);
  if (existing) {
    existing.abort();
  }

  const controller = new AbortController();
  activeStreams.set(sessionId, controller);

  let clientClosed = false;
  res.on('close', () => {
    clientClosed = true;
    if (activeStreams.get(sessionId) === controller) {
      controller.abort();
    }
  });

  setSseHeaders(res);

  return {
    controller,
    isClientClosed() {
      return clientClosed;
    },
    clear() {
      if (activeStreams.get(sessionId) === controller) {
        activeStreams.delete(sessionId);
      }
    },
  };
}

export function buildContinuationMessages(rawMessages, originalContent) {
  const messages = [...rawMessages];
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role !== 'user') {
    return [...messages, { role: 'assistant', content: originalContent }];
  }
  messages.push({ role: 'assistant', content: originalContent });
  return messages;
}
