import { countContextTokens } from './token-counter.js';

/** Evict whole old turns. Callers may supply a variant assembled without optional sections. */
export function enforcePromptBudget(messages, { contextLimit, maxTokens, mode = 'generation', withoutOptional } = {}) {
  if (!Number.isInteger(contextLimit) || contextLimit <= 0 || !Number.isInteger(maxTokens) || maxTokens <= 0) {
    throw new Error(`Invalid prompt budget for ${mode}: context limit and output reservation must be positive integers`);
  }
  const inputLimit = contextLimit - maxTokens;
  if (inputLimit <= 0) {
    throw new Error(`Prompt budget exceeded for ${mode}: ${maxTokens} output tokens leave no input capacity in a ${contextLimit}-token context`);
  }

  let fitted = messages.slice();
  let inputTokens = countContextTokens(fitted);
  const droppedOptional = inputTokens > inputLimit && !!withoutOptional;
  if (droppedOptional) {
    fitted = withoutOptional();
    inputTokens = countContextTokens(fitted);
  }
  const start = fitted[0]?.role === 'system' ? 1 : 0;
  const users = fitted.flatMap((message, index) => message.role === 'user' ? [index] : []);
  // Keep the last user together with its assistant prefill. For an appended
  // continuation instruction also keep the target turn immediately before it.
  const keepFrom = users.at(mode.endsWith('continuation') && fitted.at(-1)?.role === 'user' ? -2 : -1) ?? start;
  let cursor = start;
  for (const boundary of users) {
    if (inputTokens <= inputLimit || boundary > keepFrom) break;
    inputTokens -= countContextTokens(fitted.slice(cursor, boundary));
    cursor = boundary;
  }
  if (cursor > start) fitted = [...fitted.slice(0, start), ...fitted.slice(cursor)];
  inputTokens = countContextTokens(fitted);
  if (inputTokens > inputLimit) {
    throw new Error(`Prompt budget exceeded for ${mode}: protected request needs approximately ${inputTokens} input tokens, but only ${inputLimit} remain after reserving ${maxTokens} output tokens (context limit ${contextLimit})`);
  }
  return { messages: fitted, contextLimit, inputLimit, inputTokens, outputReservation: maxTokens, droppedOptional };
}
