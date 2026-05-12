import { loadBackendPrompt } from '../prompts/prompt-loader.js';

const PREFILL_PROVIDERS = new Set(['anthropic', 'kimi-coding', 'minimax-coding']);

export function supportsPrefill(provider) {
  return PREFILL_PROVIDERS.has(provider);
}

const CONTINUE_USER_INSTRUCTION = loadBackendPrompt('continue-user-instruction.md');

export function buildContinuationMessages(rawMessages, originalContent, { suggestionText, usePrefill = false } = {}) {
  const messages = [...rawMessages];
  const lastMessage = messages[messages.length - 1];

  if (usePrefill && !suggestionText && lastMessage?.role === 'user') {
    messages.push({ role: 'assistant', content: originalContent });
    return messages;
  }

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
