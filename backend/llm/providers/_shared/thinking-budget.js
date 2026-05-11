// 跨 provider 的 thinking budget 解析（Anthropic / Gemini 共用 budget_*；qwen 单独走 resolveQwenBudget）
import {
  LLM_THINKING_BUDGET_LOW,
  LLM_THINKING_BUDGET_MEDIUM,
  LLM_THINKING_BUDGET_HIGH,
} from '../../../utils/constants.js';

/** thinking_level → budget_tokens（Anthropic / Gemini 共用） */
export function resolveThinkingBudget(thinking_level) {
  const MAP = {
    budget_low:    LLM_THINKING_BUDGET_LOW,
    budget_medium: LLM_THINKING_BUDGET_MEDIUM,
    budget_high:   LLM_THINKING_BUDGET_HIGH,
  };
  return MAP[thinking_level] ?? null;
}
