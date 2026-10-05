// 跨 provider 的思考档位解析：effort_* 取强度名，budget_* 取 token 预算（Anthropic / Gemini 共用；qwen 预算在 openai-compatible/thinking.js）
import {
  THINKING_BUDGET_LOW,
  THINKING_BUDGET_MEDIUM,
  THINKING_BUDGET_HIGH,
} from '../../../utils/constants.js';

/** thinking_level → budget_tokens（Anthropic / Gemini 共用） */
export function resolveThinkingBudget(thinking_level) {
  const MAP = {
    budget_low:    THINKING_BUDGET_LOW,
    budget_medium: THINKING_BUDGET_MEDIUM,
    budget_high:   THINKING_BUDGET_HIGH,
  };
  return MAP[thinking_level] ?? null;
}

/** effort_* → 强度名（low / medium / high / xhigh / max），其余返回 null */
export function resolveThinkingEffort(thinking_level) {
  return thinking_level?.startsWith('effort_') ? thinking_level.slice('effort_'.length) : null;
}
