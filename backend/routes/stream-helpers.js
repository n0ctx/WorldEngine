import { loadBackendPrompt } from '../prompts/prompt-loader.js';

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

const CONTINUE_USER_INSTRUCTION = loadBackendPrompt('continue-user-instruction.md');

export function buildContinuationMessages(rawMessages, originalContent, { suggestionText } = {}) {
  const messages = [...rawMessages];
  const lastMessage = messages[messages.length - 1];

  const continueContent = suggestionText
    ? `${CONTINUE_USER_INSTRUCTION}\n\n${suggestionText}`
    : CONTINUE_USER_INSTRUCTION;

  if (lastMessage?.role !== 'user') {
    messages.push({ role: 'user', content: continueContent });
    return messages;
  }

  messages.push({ role: 'assistant', content: originalContent });
  messages.push({ role: 'user', content: continueContent });
  return messages;
}
