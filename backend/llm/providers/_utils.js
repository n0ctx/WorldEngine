import {
  LLM_THINKING_BUDGET_LOW,
  LLM_THINKING_BUDGET_MEDIUM,
  LLM_THINKING_BUDGET_HIGH,
} from '../../utils/constants.js';

export const DEFAULT_BASE_URLS = {
  openai:       'https://api.openai.com/v1',
  openrouter:   'https://openrouter.ai/api/v1',
  glm:          'https://open.bigmodel.cn/api/paas/v4',
  kimi:         'https://api.moonshot.cn/v1',
  minimax:      'https://api.minimax.chat/v1',
  deepseek:     'https://api.deepseek.com',
  grok:         'https://api.x.ai/v1',
  siliconflow:  'https://api.siliconflow.cn/v1',
  anthropic:    'https://api.anthropic.com',
  gemini:       'https://generativelanguage.googleapis.com',
};

export const OPENAI_COMPATIBLE = new Set([
  'openai', 'openrouter', 'glm', 'kimi', 'minimax', 'deepseek', 'grok', 'siliconflow',
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

export async function* parseSSE(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        yield { event: currentEvent, data };
      } else if (line === '') {
        currentEvent = '';
      }
    }
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

/** thinking_level → budget_tokens（Anthropic / Gemini 共用） */
export function resolveThinkingBudget(thinking_level) {
  const MAP = {
    budget_low:    LLM_THINKING_BUDGET_LOW,
    budget_medium: LLM_THINKING_BUDGET_MEDIUM,
    budget_high:   LLM_THINKING_BUDGET_HIGH,
  };
  return MAP[thinking_level] ?? null;
}
