import { getBaseUrl, apiError, parseSSE, executeToolCall, resolveThinkingBudget } from './_utils.js';
import { convertToGeminiContents } from './_converters.js';
import { recordTokenUsage } from './cache-usage.js';
import { logRawRequest } from '../raw-logger.js';

function toGeminiTools(toolDefs) {
  return [{ functionDeclarations: toolDefs.map((t) => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters })) }];
}

export async function* streamGemini(messages, config) {
  const baseUrl = getBaseUrl(config);
  const model = (config.model || 'gemini-pro').replace(/^models\//, '');
  const url = `${baseUrl}/v1beta/models/${model}:streamGenerateContent?key=${config.api_key}&alt=sse`;

  const { contents, systemInstruction } = convertToGeminiContents(messages);
  const body = { contents };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  body.generationConfig = {};
  if (config.temperature != null) body.generationConfig.temperature = config.temperature;
  if (config.max_tokens != null) body.generationConfig.maxOutputTokens = config.max_tokens;

  const thinkingBudget = resolveThinkingBudget(config.thinking_level);
  if (thinkingBudget != null) body.generationConfig.thinkingConfig = { thinkingBudget };

  logRawRequest(body, config, config.callType || 'stream');
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: config.signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw apiError(`Gemini API error: ${resp.status} ${text}`, resp.status);
  }

  let inThinking = false;
  for await (const { data } of parseSSE(resp.body)) {
    try {
      const parsed = JSON.parse(data);
      const meta = parsed.usageMetadata;
      if (meta && config.usageRef) {
        recordTokenUsage(config.usageRef, meta, config.provider);
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
    } catch { /* skip */ }
  }
  if (inThinking) yield '</think>\n';
}

export async function completeGemini(messages, config) {
  const baseUrl = getBaseUrl(config);
  const model = (config.model || 'gemini-pro').replace(/^models\//, '');
  const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${config.api_key}`;

  const { contents, systemInstruction } = convertToGeminiContents(messages);
  const body = { contents };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  body.generationConfig = {};
  if (config.temperature != null) body.generationConfig.temperature = config.temperature;
  if (config.max_tokens != null) body.generationConfig.maxOutputTokens = config.max_tokens;

  const thinkingBudget = resolveThinkingBudget(config.thinking_level);
  if (thinkingBudget != null) body.generationConfig.thinkingConfig = { thinkingBudget };

  logRawRequest(body, config, config.callType || 'complete');
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: config.signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw apiError(`Gemini API error: ${resp.status} ${text}`, resp.status);
  }

  const data = await resp.json();
  if (data.usageMetadata && config.usageRef) {
    recordTokenUsage(config.usageRef, data.usageMetadata, config.provider);
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

  logRawRequest(body, config, config.callType ? `${config.callType}:native` : 'complete-native');
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: config.signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw apiError(`Gemini API error: ${resp.status} ${text}`, resp.status);
  }

  const data = await resp.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  let result = '';
  for (const part of parts) {
    if (!part.text) continue;
    result += part.thought ? `<think>${part.text}</think>\n` : part.text;
  }
  return result;
}

export async function completeGeminiWithTools(messages, toolDefs, toolHandlers, config) {
  const baseUrl = getBaseUrl(config);
  const model = (config.model || 'gemini-pro').replace(/^models\//, '');
  const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${config.api_key}`;

  // 维护 Gemini 原生格式，避免 thought_signature 在 OpenAI 格式往返中丢失
  const { contents: initialContents, systemInstruction } = convertToGeminiContents(messages);
  let nativeContents = [...initialContents];

  for (let i = 0; i < 5; i++) {
    const body = { contents: nativeContents, tools: toGeminiTools(toolDefs) };
    if (systemInstruction) body.systemInstruction = systemInstruction;
    body.generationConfig = {};
    if (config.temperature != null) body.generationConfig.temperature = config.temperature;
    if (config.max_tokens != null) body.generationConfig.maxOutputTokens = config.max_tokens;

    logRawRequest(body, config, config.callType ? `${config.callType}:tools` : 'complete-tools');
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: config.signal });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      if (resp.status === 400 || resp.status === 422) return completeGeminiFromNative(initialContents, systemInstruction, config);
      throw apiError(`Gemini API error: ${resp.status} ${text}`, resp.status);
    }

    const data = await resp.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall);
    const textContent = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');

    if (!functionCalls.length) return textContent;

    // 保留原始 parts（含 thought_signature）直接追加，不做格式转换
    nativeContents = [...nativeContents, { role: 'model', parts }];

    const fnResponses = [];
    for (const p of functionCalls) {
      const fc = p.functionCall;
      const fn = toolHandlers[fc.name];
      let result;
      try { result = fn ? String(await fn(fc.args || {})) : `工具未定义：${fc.name}`; }
      catch (e) { result = `工具执行失败：${e.message}`; }
      fnResponses.push({ functionResponse: { name: fc.name, response: { output: result } } });
    }
    nativeContents = [...nativeContents, { role: 'user', parts: fnResponses }];
  }

  return completeGeminiFromNative(nativeContents, systemInstruction, config);
}

export async function resolveToolContextGemini(messages, toolDefs, toolHandlers, config) {
  const baseUrl = getBaseUrl(config);
  const model = (config.model || 'gemini-pro').replace(/^models\//, '');
  const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${config.api_key}`;

  // 维护 Gemini 原生格式，避免 thought_signature 在 OpenAI 格式往返中丢失
  const { contents: initialContents, systemInstruction } = convertToGeminiContents(messages);
  let nativeContents = [...initialContents];
  let currentMessages = [...messages];
  let enriched = false;

  for (let i = 0; i < 5; i++) {
    const body = { contents: nativeContents, tools: toGeminiTools(toolDefs) };
    if (systemInstruction) body.systemInstruction = systemInstruction;
    body.generationConfig = { maxOutputTokens: i === 0 ? 1000 : config.max_tokens, temperature: 0 };

    logRawRequest(body, config, config.callType ? `${config.callType}:resolve` : 'resolve-tools');
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: config.signal });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw apiError(`Gemini API error: ${resp.status} ${text}`, resp.status);
    }

    const data = await resp.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall);
    if (!functionCalls.length) return enriched ? currentMessages : messages;

    // 保留原始 parts（含 thought_signature）直接追加，不做格式转换
    nativeContents = [...nativeContents, { role: 'model', parts }];

    // 同步维护 OpenAI 格式的 currentMessages，供调用方（streamGemini）使用
    // 附加 _geminiParts 以便 convertToGeminiContents 能还原 thought_signature
    const textContent = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
    const openaiToolCalls = functionCalls.map((p, idx) => ({ id: `gc_${i}_${idx}`, type: 'function', function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {}) } }));
    currentMessages.push({ role: 'assistant', content: textContent || null, tool_calls: openaiToolCalls, _geminiParts: parts });

    const fnResponses = [];
    for (let j = 0; j < functionCalls.length; j++) {
      const fc = functionCalls[j].functionCall;
      const fn = toolHandlers[fc.name];
      let result;
      try { result = fn ? String(await fn(fc.args || {})) : `工具未定义：${fc.name}`; }
      catch (e) { result = `工具执行失败：${e.message}`; }
      fnResponses.push({ functionResponse: { name: fc.name, response: { output: result } } });
      currentMessages.push({ role: 'tool', tool_call_id: openaiToolCalls[j].id, content: result });
    }
    nativeContents = [...nativeContents, { role: 'user', parts: fnResponses }];
    enriched = true;
  }

  return enriched ? currentMessages : messages;
}
