/**
 * 云端 LLM Provider 适配 — 路由层
 *
 * 将 streamChat / complete / completeWithTools / resolveToolContext
 * 路由到各 provider 实现模块：
 *   openai-compatible.js  OpenAI / OpenRouter / GLM / Kimi / MiniMax / DeepSeek / Grok / SiliconFlow
 *   anthropic.js          Anthropic Messages API
 *   gemini.js             Gemini generateContent API
 */

import { OPENAI_COMPATIBLE, apiError } from './_utils.js';
import {
  streamOpenAICompatible,
  completeOpenAICompatible,
  completeOpenAICompatibleWithTools,
  resolveToolContextOpenAI,
} from './openai-compatible.js';
import {
  streamAnthropic,
  completeAnthropic,
  completeAnthropicWithTools,
  resolveToolContextAnthropic,
} from './anthropic.js';
import {
  streamGemini,
  completeGemini,
  completeGeminiWithTools,
  resolveToolContextGemini,
} from './gemini.js';

const NAMED_ADAPTERS = {
  'kimi-coding': {
    stream: streamAnthropic,
    complete: completeAnthropic,
    completeWithTools: completeAnthropicWithTools,
    resolveToolContext: resolveToolContextAnthropic,
  },
  'minimax-coding': {
    stream: streamAnthropic,
    complete: completeAnthropic,
    completeWithTools: completeAnthropicWithTools,
    resolveToolContext: resolveToolContextAnthropic,
  },
  anthropic: {
    stream: streamAnthropic,
    complete: completeAnthropic,
    completeWithTools: completeAnthropicWithTools,
    resolveToolContext: resolveToolContextAnthropic,
  },
  gemini: {
    stream: streamGemini,
    complete: completeGemini,
    completeWithTools: completeGeminiWithTools,
    resolveToolContext: resolveToolContextGemini,
  },
};

const OPENAI_COMPATIBLE_ADAPTER = {
  stream: streamOpenAICompatible,
  complete: completeOpenAICompatible,
  completeWithTools: completeOpenAICompatibleWithTools,
  resolveToolContext: resolveToolContextOpenAI,
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

export async function resolveToolContext(messages, toolDefs, toolHandlers, config) {
  const adapter = getAdapter(config.provider);
  if (!adapter) return messages; // 未知 provider 原样返回
  return adapter.resolveToolContext(messages, toolDefs, toolHandlers, config);
}
