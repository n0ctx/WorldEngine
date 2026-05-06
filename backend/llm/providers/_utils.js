import {
  LLM_THINKING_BUDGET_LOW,
  LLM_THINKING_BUDGET_MEDIUM,
  LLM_THINKING_BUDGET_HIGH,
} from '../../utils/constants.js';

export const DEFAULT_BASE_URLS = {
  openai:          'https://api.openai.com/v1',
  openrouter:      'https://openrouter.ai/api/v1',
  glm:             'https://api.z.ai/api/paas/v4',
  'glm-coding':    'https://api.z.ai/api/coding/paas/v4',
  kimi:            'https://api.moonshot.cn/v1',
  'kimi-coding':   'https://api.kimi.com/coding',
  minimax:         'https://api.minimax.chat/v1',
  'minimax-coding':'https://api.minimax.io/anthropic',
  deepseek:        'https://api.deepseek.com',
  grok:            'https://api.x.ai/v1',
  siliconflow:     'https://api.siliconflow.cn/v1',
  qwen:            'https://dashscope.aliyuncs.com/compatible-mode/v1',
  anthropic:       'https://api.anthropic.com',
  gemini:          'https://generativelanguage.googleapis.com',
};

export const OPENAI_COMPATIBLE = new Set([
  'openai', 'openrouter', 'glm', 'glm-coding', 'kimi', 'kimi-coding', 'minimax', 'deepseek', 'grok', 'siliconflow', 'qwen', 'xiaomi',
]);

export function getBaseUrl(config) {
  return (config.base_url || DEFAULT_BASE_URLS[config.provider] || '').replace(/\/+$/, '');
}

/** 解析 data URL → { mimeType, data } */
export function parseDataUrl(dataUrl) {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  return m ? { mimeType: m[1], data: m[2] } : null;
}

/** 创建带状态码的错误 */
export function apiError(message, status, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

async function* iterateBodyChunks(body) {
  if (!body) return;

  if (typeof body.getReader === 'function') {
    const reader = body.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) yield value;
      }
    } finally {
      reader.releaseLock();
    }
    return;
  }

  for await (const chunk of body) {
    yield chunk;
  }
}

export async function* parseSSE(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';

  const parseLine = (line) => {
    if (line.startsWith('event:')) {
      currentEvent = line.slice(6).trim();
      return null;
    }
    if (line.startsWith('data:')) {
      const data = line.slice(5).trimStart();
      if (data === '[DONE]') return { done: true };
      return { event: currentEvent, data };
    }
    if (line === '') {
      currentEvent = '';
    }
    return null;
  };

  for await (const chunk of iterateBodyChunks(body)) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const parsed = parseLine(line.trimEnd());
      if (parsed?.done) return;
      if (parsed) yield parsed;
    }
  }

  buffer += decoder.decode();
  if (!buffer) return;

  for (const line of buffer.split('\n')) {
    const parsed = parseLine(line.trimEnd());
    if (parsed?.done) return;
    if (parsed) yield parsed;
  }
}

/** 执行单个 tool call，返回字符串结果 */
export async function executeToolCall(tc, toolHandlers) {
  const fn = toolHandlers[tc.function?.name];
  if (!fn) return `工具未定义：${tc.function?.name}`;
  try {
    const args = JSON.parse(tc.function.arguments || '{}');
    return String(await fn(args));
  } catch (e) {
    return `工具执行失败：${e.message}`;
  }
}

/** 安全解析 JSON，失败时返回 fallback（默认 {}） */
export function safeParseJson(str, fallback = {}) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export function extractProviderError(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.error === 'string') return data.error;
  if (data.error?.message) return data.error.message;
  if (typeof data.message === 'string' && (data.code || data.status)) return data.message;
  return null;
}

/** thinking_level → budget_tokens（Anthropic / Gemini 共用） */
export function resolveThinkingBudget(thinking_level) {
  const MAP = {
    budget_low:    LLM_THINKING_BUDGET_LOW,
    budget_medium: LLM_THINKING_BUDGET_MEDIUM,
    budget_high:   LLM_THINKING_BUDGET_HIGH,
  };
  return MAP[thinking_level] ?? null;
}

/** qwen-style thinking_budget（enable_thinking + thinking_budget 数值） */
export function resolveQwenBudget(thinking_level) {
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
      // Grok 仅支持 low/high；medium 兜底向上取 high，避免 400
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
        return enabledFlag ? 'enabled' : 'disabled';
      }
      return null;
    }
    case 'glm':
    case 'glm-coding':
    case 'deepseek': {
      if (!isThinkingType) return null;
      body.thinking = { type: enabledFlag ? 'enabled' : 'disabled' };
      return enabledFlag ? 'enabled' : 'disabled';
    }
    case 'qwen':
    case 'siliconflow': {
      if (isThinkingType) {
        body.enable_thinking = enabledFlag;
        return enabledFlag ? 'enabled' : 'disabled';
      }
      const budget = resolveQwenBudget(lvl);
      if (budget != null) {
        body.enable_thinking = true;
        body.thinking_budget = budget;
        return 'enabled';
      }
      return null;
    }
    case 'kimi':
    case 'minimax':
    default:
      return null;
  }
}
