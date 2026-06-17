import { loadBackendPrompt } from '../prompts/prompt-loader.js';

const PREFILL_PROVIDERS = new Set(['anthropic', 'kimi-coding', 'minimax-coding']);

export function supportsPrefill(provider) {
  return PREFILL_PROVIDERS.has(provider);
}

const CONTINUE_USER_INSTRUCTION = loadBackendPrompt('continue-user-instruction.md');

// 续写模式下 rawMessages 由 assembler 的 continuation 分支产出，已自然以待续写的 assistant
// （= originalContent）收尾、无尾部 post-prompt / 重复的 current user。因此：
// - prefill provider 且未启用 suggestion：原样返回，末尾 assistant 即 prefill，模型从断点续写。
// - 其余情况：仅追加一条续写指令 user（内含 suggestion，单次注入），不再重复贴 originalContent。
// originalContent 仅保留给"末尾非 assistant"的兜底分支（理论上续写模式不会发生）。
export function buildContinuationMessages(rawMessages, originalContent, { suggestionText, usePrefill = false } = {}) {
  const messages = [...rawMessages];
  const lastMessage = messages[messages.length - 1];

  if (usePrefill && !suggestionText && lastMessage?.role === 'assistant') {
    return messages;
  }

  const continueContent = suggestionText
    ? `${CONTINUE_USER_INSTRUCTION}\n\n${suggestionText}`
    : CONTINUE_USER_INSTRUCTION;

  if (lastMessage?.role === 'assistant') {
    messages.push({ role: 'user', content: continueContent });
    return messages;
  }

  // 兜底：末尾非 assistant 时补贴待续写内容后再追加指令。
  messages.push({ role: 'assistant', content: originalContent });
  messages.push({ role: 'user', content: continueContent });
  return messages;
}
