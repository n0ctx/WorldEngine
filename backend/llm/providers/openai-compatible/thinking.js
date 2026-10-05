// OpenAI-compatible 系列 provider 的 thinking 字段写入逻辑。
import {
  THINKING_BUDGET_LOW,
  THINKING_BUDGET_MEDIUM,
  THINKING_BUDGET_HIGH,
  isThinkingLevelSupported,
} from '../../../utils/constants.js';
import { resolveThinkingEffort } from '../_shared/thinking-budget.js';

/** qwen-style thinking_budget（enable_thinking + thinking_budget 数值） */
const QWEN_BUDGETS = {
  qwen_low:    THINKING_BUDGET_LOW,
  qwen_medium: THINKING_BUDGET_MEDIUM,
  qwen_high:   THINKING_BUDGET_HIGH,
};

// llama.cpp 的 Qwen3 模板只认 low|medium|xhigh，「高」映射到服务端最高档 xhigh
const LLAMACPP_EFFORTS = { effort_low: 'low', effort_medium: 'medium', effort_high: 'xhigh' };

/**
 * 把 thinking_level 翻译成对应 provider 的请求体字段，并写入 body。
 * 只接受 shared/thinking-levels.mjs 里该 provider 列出的档位，其余一律不下发。
 *
 * 各 provider 实际语法（2026-10 官方文档）：
 * - openai / ollama：reasoning_effort: none（关闭）/ low / medium / high / xhigh / max
 * - grok：reasoning_effort: low / medium / high / xhigh
 * - openrouter：reasoning: { effort } 或 reasoning: { enabled }
 * - xiaomi：thinking: { type: enabled | disabled }
 * - minimax：thinking: { type: adaptive | disabled }（disabled 仅 M3 生效，M2.x 忽略）
 * - deepseek / glm / glm-coding：thinking: { type }，强度档另加 reasoning_effort（GLM 仅 5.2 及以上）
 * - kimi：关闭发 thinking: { type: disabled }（K2.6）；强度档发 reasoning_effort（K3）
 * - qwen / siliconflow：enable_thinking + thinking_budget
 * - llamacpp：关闭用 chat_template_kwargs.enable_thinking=false；强度档用 reasoning_effort（按请求覆盖 server 默认值）
 *
 * 返回值：'enabled' | 'disabled' | null
 *   'enabled'  → 思考开启，调用方应抑制 temperature（DeepSeek/OpenAI 思考模式不接受 temp）
 *   'disabled' → 显式关闭思考，保留 temperature
 *   null       → 未应用任何字段（自动 / 不支持），保留 temperature
 */
export function applyThinkingToOpenAICompatibleBody(body, config) {
  const lvl = config?.thinking_level;
  const provider = config?.provider;
  if (!lvl || !isThinkingLevelSupported(provider, lvl)) return null;

  const disabled = lvl === 'thinking_disabled';
  const state = disabled ? 'disabled' : 'enabled';
  const effort = resolveThinkingEffort(lvl);

  switch (provider) {
    case 'openai':
    case 'ollama':
      body.reasoning_effort = disabled ? 'none' : effort;
      return state;
    case 'grok':
      body.reasoning_effort = effort;
      return state;
    case 'openrouter':
      body.reasoning = effort ? { effort } : { enabled: !disabled };
      return state;
    case 'xiaomi':
      body.thinking = { type: state };
      return state;
    case 'minimax':
      body.thinking = { type: disabled ? 'disabled' : 'adaptive' };
      return state;
    case 'deepseek':
    case 'glm':
    case 'glm-coding':
      body.thinking = { type: state };
      if (effort) body.reasoning_effort = effort;
      return state;
    case 'kimi':
      if (disabled) body.thinking = { type: 'disabled' };
      else body.reasoning_effort = effort;
      return state;
    case 'qwen':
    case 'siliconflow':
      body.enable_thinking = !disabled;
      if (QWEN_BUDGETS[lvl]) body.thinking_budget = QWEN_BUDGETS[lvl];
      return state;
    case 'llamacpp':
      // Qwen3 模板认 chat_template_kwargs.enable_thinking 关闭思考
      if (disabled) body.chat_template_kwargs = { ...(body.chat_template_kwargs || {}), enable_thinking: false };
      else body.reasoning_effort = LLAMACPP_EFFORTS[lvl];
      return state;
    default:
      return null;
  }
}
