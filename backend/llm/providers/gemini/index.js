import { getBaseUrl } from '../_shared/base-urls.js';
import { apiError, parseSSE, executeToolCall } from '../_shared/fetch-utils.js';
import { resolveThinkingBudget } from '../_shared/thinking-budget.js';
import { convertToGeminiContents } from '../_shared/converters.js';
import { recordTokenUsage } from '../_shared/cache-usage.js';
import { getOrCreateCache } from './cache.js';
import { logRawRequest } from '../../raw-logger.js';
import { createLogger, formatMeta } from '../../../utils/logger.js';
import { runToolLoop } from '../../tool-loop-control.js';

const cacheLog = createLogger('gemini-cache', 'cyan');
const log = createLogger('llm', 'magenta');

function logGeminiUsage(model, meta) {
  if (!meta) return;
  log.info('provider.usage', formatMeta({
    provider: 'gemini',
    model,
    prompt_tokens: meta.promptTokenCount,
    completion_tokens: meta.candidatesTokenCount,
  }));
}

// Gemini 3.x implicit cache 在常见区间存在 dead zone（issue #2064），强制走 explicit cachedContents。
// 2.5 系列 implicit 已稳定命中，不启用 explicit 以避免引入额外 HTTP 调用。
const EXPLICIT_CACHE_MIN_CHARS = 4000;

const SAFETY_SETTINGS_OFF = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
];
function shouldUseExplicitCache(config) {
  if (!config.cacheableSystem || config.cacheableSystem.length < EXPLICIT_CACHE_MIN_CHARS) return false;
  const model = (config.model || '').toLowerCase();
  return /gemini-3(\.|-)/.test(model);
}

/**
 * 把稳定 system 前缀放入 cachedContents，剩余 dynamic system 注入首条 user message。
 * @returns {Promise<{ contents, cachedContent } | null>} null 表示降级到非缓存路径
 */
async function buildCachedRequestParts(messages, config) {
  const { contents, systemInstruction } = convertToGeminiContents(messages);
  const fullSystem = systemInstruction?.parts?.map((p) => p.text || '').join('\n\n') || '';
  const cacheable = config.cacheableSystem;
  if (!cacheable) return null;

  let dynamicSystem = '';
  if (fullSystem.startsWith(cacheable)) {
    dynamicSystem = fullSystem.slice(cacheable.length).replace(/^\s*\n+/, '');
  } else {
    cacheLog.warn(`SYSTEM PREFIX MISMATCH  cacheable=${cacheable.length}  full=${fullSystem.length}  fallback`);
    return null;
  }

  const baseUrl = getBaseUrl(config);
  const cachedContentName = await getOrCreateCache({
    model: config.model,
    systemText: cacheable,
    baseUrl,
    apiKey: config.api_key,
    signal: config.signal,
  });

  // dynamicSystem 注入首条 user message（cachedContents 内 stub 末尾为 model role，请求 contents 必须以 user 起始）
  const newContents = contents.map((c) => ({ ...c, parts: [...(c.parts || [])] }));
  if (dynamicSystem) {
    if (newContents.length > 0 && newContents[0].role === 'user') {
      const firstParts = newContents[0].parts;
      const firstTextIdx = firstParts.findIndex((p) => typeof p.text === 'string');
      if (firstTextIdx >= 0) {
        firstParts[firstTextIdx] = { ...firstParts[firstTextIdx], text: `${dynamicSystem}\n\n${firstParts[firstTextIdx].text}` };
      } else {
        firstParts.unshift({ text: dynamicSystem });
      }
    } else {
      newContents.unshift({ role: 'user', parts: [{ text: dynamicSystem }] });
    }
  }

  return { contents: newContents, cachedContent: cachedContentName };
}

function toGeminiTools(toolDefs) {
  return [{ functionDeclarations: toolDefs.map((t) => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters })) }];
}

export async function* streamGemini(messages, config) {
  log.debug('provider.request', formatMeta({ provider: 'gemini', model: config.model, msgs: messages.length, mode: 'stream' }));
  const baseUrl = getBaseUrl(config);
  const model = (config.model || 'gemini-pro').replace(/^models\//, '');
  const url = `${baseUrl}/v1beta/models/${model}:streamGenerateContent?key=${config.api_key}&alt=sse`;

  let body = null;
  if (shouldUseExplicitCache(config)) {
    try {
      const cached = await buildCachedRequestParts(messages, config);
      if (cached) {
        body = { contents: cached.contents, cachedContent: cached.cachedContent };
      }
    } catch (err) {
      cacheLog.warn(`STREAM FALLBACK  ${err.message}`);
    }
  }
  if (!body) {
    const { contents, systemInstruction } = convertToGeminiContents(messages);
    body = { contents };
    if (systemInstruction) body.systemInstruction = systemInstruction;
  }
  body.generationConfig = {};
  if (config.temperature != null) body.generationConfig.temperature = config.temperature;
  if (config.max_tokens != null) body.generationConfig.maxOutputTokens = config.max_tokens;

  const thinkingBudget = resolveThinkingBudget(config.thinking_level);
  if (thinkingBudget != null) body.generationConfig.thinkingConfig = { thinkingBudget, includeThoughts: true };

  body.safetySettings = SAFETY_SETTINGS_OFF;
  logRawRequest(body, config, config.callType || 'stream');
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: config.signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    log.error('provider.http_error', formatMeta({ provider: 'gemini', status: resp.status, msg: text }));
    throw apiError(`Gemini API error: ${resp.status} ${text}`, resp.status);
  }

  let inThinking = false;
  let lastUsage = null;
  for await (const { data } of parseSSE(resp.body)) {
    try {
      const parsed = JSON.parse(data);
      const meta = parsed.usageMetadata;
      if (meta) {
        lastUsage = meta;
        if (config.usageRef) recordTokenUsage(config.usageRef, meta, config.provider);
      }
      const parts = parsed.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (!part.text) continue;
        if (part.thought) {
          if (!inThinking) { yield '<think>'; inThinking = true; }
          yield part.text;
        } else {
          if (inThinking) { yield '</think>\n'; inThinking = false; }
          yield part.text;
        }
      }
    } catch (err) { log.error('provider.parse_error', formatMeta({ provider: 'gemini', msg: err.message })); }
  }
  if (inThinking) yield '</think>\n';
  logGeminiUsage(config.model, lastUsage);
}

export async function completeGemini(messages, config) {
  log.debug('provider.request', formatMeta({ provider: 'gemini', model: config.model, msgs: messages.length, mode: 'complete' }));
  const baseUrl = getBaseUrl(config);
  const model = (config.model || 'gemini-pro').replace(/^models\//, '');
  const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${config.api_key}`;

  let body = null;
  if (shouldUseExplicitCache(config)) {
    try {
      const cached = await buildCachedRequestParts(messages, config);
      if (cached) {
        body = { contents: cached.contents, cachedContent: cached.cachedContent };
      }
    } catch (err) {
      cacheLog.warn(`COMPLETE FALLBACK  ${err.message}`);
    }
  }
  if (!body) {
    const { contents, systemInstruction } = convertToGeminiContents(messages);
    body = { contents };
    if (systemInstruction) body.systemInstruction = systemInstruction;
  }
  body.generationConfig = {};
  if (config.temperature != null) body.generationConfig.temperature = config.temperature;
  if (config.max_tokens != null) body.generationConfig.maxOutputTokens = config.max_tokens;

  const thinkingBudget = resolveThinkingBudget(config.thinking_level);
  if (thinkingBudget != null) body.generationConfig.thinkingConfig = { thinkingBudget, includeThoughts: true };

  body.safetySettings = SAFETY_SETTINGS_OFF;
  logRawRequest(body, config, config.callType || 'complete');
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: config.signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    log.error('provider.http_error', formatMeta({ provider: 'gemini', status: resp.status, msg: text }));
    throw apiError(`Gemini API error: ${resp.status} ${text}`, resp.status);
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    log.error('provider.parse_error', formatMeta({ provider: 'gemini', msg: err.message }));
    throw err;
  }
  if (data.usageMetadata) {
    logGeminiUsage(config.model, data.usageMetadata);
    if (config.usageRef) recordTokenUsage(config.usageRef, data.usageMetadata, config.provider);
  }
  const parts = data.candidates?.[0]?.content?.parts || [];
  let result = '';
  for (const part of parts) {
    if (!part.text) continue;
    result += part.thought ? `<think>${part.text}</think>\n` : part.text;
  }
  return result;
}

// 内部 helper：直接用已转换的 nativeContents 调用 generateContent（跳过格式转换）
async function completeGeminiFromNative(nativeContents, systemInstruction, config) {
  const baseUrl = getBaseUrl(config);
  const model = (config.model || 'gemini-pro').replace(/^models\//, '');
  const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${config.api_key}`;

  const body = { contents: nativeContents };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  body.generationConfig = {};
  if (config.temperature != null) body.generationConfig.temperature = config.temperature;
  if (config.max_tokens != null) body.generationConfig.maxOutputTokens = config.max_tokens;

  const thinkingBudget = resolveThinkingBudget(config.thinking_level);
  if (thinkingBudget != null) body.generationConfig.thinkingConfig = { thinkingBudget };

  body.safetySettings = SAFETY_SETTINGS_OFF;
  logRawRequest(body, config, config.callType ? `${config.callType}:native` : 'complete-native');
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: config.signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    log.error('provider.http_error', formatMeta({ provider: 'gemini', status: resp.status, msg: text }));
    throw apiError(`Gemini API error: ${resp.status} ${text}`, resp.status);
  }

  const data = await resp.json();
  if (data.usageMetadata) logGeminiUsage(config.model, data.usageMetadata);
  const parts = data.candidates?.[0]?.content?.parts || [];
  let result = '';
  for (const part of parts) {
    if (!part.text) continue;
    result += part.thought ? `<think>${part.text}</think>\n` : part.text;
  }
  return result;
}

// Gemini 工具循环 4 原语适配器：保留原生 nativeContents 数组以避免
// thought_signature 在 OpenAI 格式往返中丢失。
const geminiToolLoopProvider = {
  initState(messages) {
    const { contents, systemInstruction } = convertToGeminiContents(messages);
    return {
      messages: [...messages],
      nativeContents: [...contents],
      initialContents: [...contents],
      systemInstruction,
    };
  },

  async oneTurn(state, toolDefs, iter, config) {
    const baseUrl = getBaseUrl(config);
    const model = (config.model || 'gemini-pro').replace(/^models\//, '');
    const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${config.api_key}`;

    const body = { contents: state.nativeContents, tools: toGeminiTools(toolDefs) };
    if (state.systemInstruction) body.systemInstruction = state.systemInstruction;
    body.generationConfig = {};
    if (config.temperature != null) body.generationConfig.temperature = config.temperature;
    if (config.max_tokens != null) body.generationConfig.maxOutputTokens = config.max_tokens;
    body.safetySettings = SAFETY_SETTINGS_OFF;

    logRawRequest(body, config, config.callType ? `${config.callType}:tools` : 'complete-tools');
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: config.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      log.error('provider.http_error', formatMeta({ provider: 'gemini', status: resp.status, msg: text }));
      if (resp.status === 400 || resp.status === 422) return { kind: 'fallback' };
      throw apiError(`Gemini API error: ${resp.status} ${text}`, resp.status);
    }

    const data = await resp.json();
    if (data.usageMetadata) logGeminiUsage(config.model, data.usageMetadata);
    const parts = data.candidates?.[0]?.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall);
    const textContent = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');

    if (!functionCalls.length) return { kind: 'text', text: textContent };

    const toolCalls = functionCalls.map((p, idx) => ({
      id: `gc_${iter}_${idx}`,
      name: p.functionCall.name,
      arguments: p.functionCall.args || {},
    }));
    // 同步维护 OpenAI 格式 assistantBlock,挂 _geminiParts 保留 thought_signature
    const assistantBlock = {
      role: 'assistant',
      content: textContent || null,
      tool_calls: toolCalls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: JSON.stringify(c.arguments) },
      })),
      _geminiParts: parts,
    };
    return { kind: 'tools', toolCalls, assistantBlock, _rawParts: parts };
  },

  appendToolTurn(state, turn, results) {
    const fnResponses = turn.toolCalls.map((c, i) => ({
      functionResponse: { name: c.name, response: { output: results[i] } },
    }));
    const toolMsgs = turn.toolCalls.map((c, i) => ({
      role: 'tool',
      tool_call_id: c.id,
      content: results[i],
    }));
    return {
      ...state,
      nativeContents: [
        ...state.nativeContents,
        { role: 'model', parts: turn._rawParts },
        { role: 'user', parts: fnResponses },
      ],
      messages: [...state.messages, turn.assistantBlock, ...toolMsgs],
    };
  },

  async completeNoTools(state, config) {
    // fallback 用初始 contents,对齐原 completeGeminiWithTools 4xx 行为
    return completeGeminiFromNative(state.initialContents, state.systemInstruction, config);
  },

  stateToMessages(state) {
    return state.messages;
  },
};

export async function completeGeminiWithTools(messages, toolDefs, toolHandlers, config) {
  log.debug('provider.request', formatMeta({ provider: 'gemini', model: config.model, msgs: messages.length, mode: 'complete-tools' }));
  return runToolLoop({
    provider: geminiToolLoopProvider,
    messages,
    toolDefs,
    toolHandlers,
    config,
    completeResultMode: config.toolResultMode ?? 'text',
  });
}
