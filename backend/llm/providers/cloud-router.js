/**
 * 云端 LLM Provider 适配 — 路由层
 *
 * 将 streamChat / complete / completeWithTools
 * 路由到各 provider 实现模块：
 *   openai-compatible/  OpenAI / OpenRouter / GLM / Kimi / MiniMax / DeepSeek / Grok / SiliconFlow
 *   anthropic/          Anthropic Messages API
 *   gemini/             Gemini generateContent API
 */

import { OPENAI_COMPATIBLE } from './_shared/base-urls.js';
import { apiError } from './_shared/fetch-utils.js';
import {
  streamOpenAICompatible,
  completeOpenAICompatible,
  completeOpenAICompatibleWithTools,
} from './openai-compatible/index.js';
import {
  streamAnthropic,
  completeAnthropic,
  completeAnthropicWithTools,
} from './anthropic/index.js';
import {
  streamGemini,
  completeGemini,
  completeGeminiWithTools,
} from './gemini/index.js';

const NAMED_ADAPTERS = {
  'kimi-coding': {
    stream: streamAnthropic,
    complete: completeAnthropic,
    completeWithTools: completeAnthropicWithTools,
  },
  'minimax-coding': {
    stream: streamAnthropic,
    complete: completeAnthropic,
    completeWithTools: completeAnthropicWithTools,
  },
  anthropic: {
    stream: streamAnthropic,
    complete: completeAnthropic,
    completeWithTools: completeAnthropicWithTools,
  },
  gemini: {
    stream: streamGemini,
    complete: completeGemini,
    completeWithTools: completeGeminiWithTools,
  },
};

const OPENAI_COMPATIBLE_ADAPTER = {
  stream: streamOpenAICompatible,
  complete: completeOpenAICompatible,
  completeWithTools: completeOpenAICompatibleWithTools,
};

function getAdapter(provider) {
  if (NAMED_ADAPTERS[provider]) return NAMED_ADAPTERS[provider];
  if (OPENAI_COMPATIBLE.has(provider)) return OPENAI_COMPATIBLE_ADAPTER;
  return null;
}

export async function* streamChat(messages, config) {
  const adapter = getAdapter(config.provider);
  if (!adapter) throw apiError(`不支持的 provider: ${config.provider}`, 400);
  yield* adapter.stream(messages, config);
}

export async function complete(messages, config) {
  const adapter = getAdapter(config.provider);
  if (!adapter) throw apiError(`不支持的 provider: ${config.provider}`, 400);
  return adapter.complete(messages, config);
}

export async function completeWithTools(messages, toolDefs, toolHandlers, config) {
  const adapter = getAdapter(config.provider);
  if (!adapter) throw apiError(`不支持的 provider: ${config.provider}`, 400);
  return adapter.completeWithTools(messages, toolDefs, toolHandlers, config);
}
