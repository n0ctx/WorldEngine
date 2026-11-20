import { enforcePromptBudget } from '../utils/prompt-budget.js';

function prependTurnContext(messages, turnContext) {
  if (!turnContext) return;
  const target = messages.findLast((msg) => msg.role === 'user');
  if (!target) {
    messages.splice(messages[0]?.role === 'system' ? 1 : 0, 0, { role: 'user', content: turnContext });
  } else if (Array.isArray(target.content)) {
    target.content.unshift({ type: 'text', text: turnContext });
  } else {
    target.content = [turnContext, target.content].filter(Boolean).join('\n\n');
  }
}

/** Fit the assembled turn; build the reduced prompt from message boundaries, not inline tags. */
export function budgetTurn(messages, { turnContext, pastOptions, cachedContent, maxTokens, contextLimit, mode }) {
  const base = messages.map((msg) => ({ ...msg, content: Array.isArray(msg.content) ? [...msg.content] : msg.content }));
  prependTurnContext(messages, [turnContext, pastOptions].filter(Boolean).join('\n\n'));
  return enforcePromptBudget(messages, { contextLimit, maxTokens, mode, withoutOptional: () => {
    if (base[0]?.role === 'system') {
      if (cachedContent) base[0].content = cachedContent;
      else base.shift();
    }
    return base;
  } });
}
