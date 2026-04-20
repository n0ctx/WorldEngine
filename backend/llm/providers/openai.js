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

export async function* streamChat(messages, config) {
  if (config.provider === 'anthropic') {
    yield* streamAnthropic(messages, config);
  } else if (config.provider === 'gemini') {
    yield* streamGemini(messages, config);
  } else if (OPENAI_COMPATIBLE.has(config.provider)) {
    yield* streamOpenAICompatible(messages, config);
  } else {
    throw apiError(`不支持的 provider: ${config.provider}`, 400);
  }
}

export async function complete(messages, config) {
  if (config.provider === 'anthropic') {
    return completeAnthropic(messages, config);
  } else if (config.provider === 'gemini') {
    return completeGemini(messages, config);
  } else if (OPENAI_COMPATIBLE.has(config.provider)) {
    return completeOpenAICompatible(messages, config);
  } else {
    throw apiError(`不支持的 provider: ${config.provider}`, 400);
  }
}

export async function completeWithTools(messages, toolDefs, toolHandlers, config) {
  if (config.provider === 'anthropic') {
    return completeAnthropicWithTools(messages, toolDefs, toolHandlers, config);
  } else if (config.provider === 'gemini') {
    return completeGeminiWithTools(messages, toolDefs, toolHandlers, config);
  } else if (OPENAI_COMPATIBLE.has(config.provider)) {
    return completeOpenAICompatibleWithTools(messages, toolDefs, toolHandlers, config);
  }
  throw apiError(`不支持的 provider: ${config.provider}`, 400);
}

export async function resolveToolContext(messages, toolDefs, toolHandlers, config) {
  if (config.provider === 'anthropic') {
    return resolveToolContextAnthropic(messages, toolDefs, toolHandlers, config);
  } else if (config.provider === 'gemini') {
    return resolveToolContextGemini(messages, toolDefs, toolHandlers, config);
  } else if (OPENAI_COMPATIBLE.has(config.provider)) {
    return resolveToolContextOpenAI(messages, toolDefs, toolHandlers, config);
  }
  return messages;
}
