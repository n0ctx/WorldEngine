// OpenAI-compatible 系列 provider 的 thinking 字段写入逻辑。
import {
  LLM_THINKING_BUDGET_LOW,
  LLM_THINKING_BUDGET_MEDIUM,
  LLM_THINKING_BUDGET_HIGH,
} from '../../../utils/constants.js';

/** qwen-style thinking_budget（enable_thinking + thinking_budget 数值） */
function resolveQwenBudget(thinking_level) {
  const MAP = {
    qwen_low:    LLM_THINKING_BUDGET_LOW,
    qwen_medium: LLM_THINKING_BUDGET_MEDIUM,
    qwen_high:   LLM_THINKING_BUDGET_HIGH,
  };
  return MAP[thinking_level] ?? null;
}

/**
 * 把 thinking_level 翻译成对应 provider 的请求体字段，并写入 body。
 *
 * 各 provider 实际语法（2026-05 调研）：
 * - openai / xiaomi / openai_compatible：reasoning_effort: low/medium/high（top-level）
 * - openrouter：reasoning: { effort } 或 reasoning: { enabled }（top-level，归一格式）
 * - grok：reasoning_effort: low/high（仅 grok-3-mini；其他 Grok 模型会 400 拒绝）
 * - glm / glm-coding：thinking: { type: "enabled" | "disabled" }（GLM-4.5+ / Z.AI 文档）
 * - deepseek：thinking: { type: "enabled" | "disabled" }（仅 deepseek-v3.1+；老版 chat/reasoner 模型会忽略）
 * - qwen / siliconflow：enable_thinking + thinking_budget（DashScope / SiliconFlow Qwen3、DeepSeek-V3.1）
 * - llamacpp：thinking_disabled → chat_template_kwargs.enable_thinking=false；reasoning_effort: low/medium/xhigh（Qwen3 jinja 模板支持按请求覆盖，实测 2026-09；server 默认值不受影响。注意服务端只认 xhigh|medium|low，不认 high）
 * - kimi / minimax：模型驱动（kimi-k2-thinking、minimax-m2 等模型自动思考），不下发参数
 *
 * 返回值：'enabled' | 'disabled' | null
 *   'enabled'  → 思考开启，调用方应抑制 temperature（DeepSeek/OpenAI o-series 思考模式不接受 temp）
 *   'disabled' → 显式关闭思考，保留 temperature
 *   null       → 未应用任何字段（auto / 不支持），保留 temperature
 */
export function applyThinkingToOpenAICompatibleBody(body, config) {
  const lvl = config?.thinking_level;
  if (!lvl) return null;

  const provider = config.provider;
  const isEffort = lvl.startsWith('effort_');
  const isThinkingType = lvl === 'thinking_enabled' || lvl === 'thinking_disabled';
  const enabledFlag = lvl === 'thinking_enabled';
  const thinkingState = enabledFlag ? 'enabled' : 'disabled';

  switch (provider) {
    case 'openai':
    case 'xiaomi':
    case 'openai_compatible': {
      if (!isEffort) return null;
      body.reasoning_effort = lvl.replace('effort_', '');
      return 'enabled';
    }
    case 'grok': {
      if (!isEffort) return null;
      const v = lvl.replace('effort_', '');
      body.reasoning_effort = v === 'medium' ? 'high' : v;
      return 'enabled';
    }
    case 'openrouter': {
      if (isEffort) {
        body.reasoning = { effort: lvl.replace('effort_', '') };
        return 'enabled';
      }
      if (isThinkingType) {
        body.reasoning = { enabled: enabledFlag };
        return thinkingState;
      }
      return null;
    }
    case 'glm':
    case 'glm-coding':
    case 'deepseek': {
      if (!isThinkingType) return null;
      body.thinking = { type: thinkingState };
      return thinkingState;
    }
    case 'qwen':
    case 'siliconflow': {
      if (isThinkingType) {
        body.enable_thinking = enabledFlag;
        return thinkingState;
      }
      const budget = resolveQwenBudget(lvl);
      if (budget != null) {
        body.enable_thinking = true;
        body.thinking_budget = budget;
        return 'enabled';
      }
      return null;
    }
    case 'llamacpp': {
      // 关闭思考：Qwen3 模板认 chat_template_kwargs.enable_thinking（reasoning_effort 无 none 档，传 none 反而照常思考）
      if (lvl === 'thinking_disabled') {
        body.chat_template_kwargs = { ...(body.chat_template_kwargs || {}), enable_thinking: false };
        return 'disabled';
      }
      // Qwen3 模板按请求覆盖：effort_high 映射到服务端最高档 xhigh
      const MAP = { effort_low: 'low', effort_medium: 'medium', effort_high: 'xhigh' };
      const v = MAP[lvl];
      if (!v) return null;
      body.reasoning_effort = v;
      return 'enabled';
    }
    case 'kimi':
    case 'minimax':
    default:
      return null;
  }
}
