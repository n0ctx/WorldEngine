import { getBaseUrl, apiError, parseSSE, executeToolCall, resolveThinkingBudget } from './_utils.js';
import { convertToGeminiContents } from './_converters.js';

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
  let currentMessages = [...messages];

  for (let i = 0; i < 5; i++) {
    const { contents, systemInstruction } = convertToGeminiContents(currentMessages);
    const body = { contents, tools: toGeminiTools(toolDefs) };
    if (systemInstruction) body.systemInstruction = systemInstruction;
    body.generationConfig = {};
    if (config.temperature != null) body.generationConfig.temperature = config.temperature;
    if (config.max_tokens != null) body.generationConfig.maxOutputTokens = config.max_tokens;

    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: config.signal });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      if (resp.status === 400 || resp.status === 422) return completeGemini(messages, config);
      throw apiError(`Gemini API error: ${resp.status} ${text}`, resp.status);
    }

    const data = await resp.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall);
    const textContent = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');

    if (!functionCalls.length) return textContent;

    const openaiToolCalls = functionCalls.map((p, idx) => ({ id: `gc_${i}_${idx}`, type: 'function', function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {}) } }));
    currentMessages.push({ role: 'assistant', content: textContent || null, tool_calls: openaiToolCalls });
    for (let j = 0; j < functionCalls.length; j++) {
      const fc = functionCalls[j].functionCall;
      const fn = toolHandlers[fc.name];
      let result;
      try { result = fn ? String(await fn(fc.args || {})) : `工具未定义：${fc.name}`; }
      catch (e) { result = `工具执行失败：${e.message}`; }
      currentMessages.push({ role: 'tool', tool_call_id: openaiToolCalls[j].id, content: result });
    }
  }

  return completeGemini(currentMessages, config);
}

export async function resolveToolContextGemini(messages, toolDefs, toolHandlers, config) {
  const baseUrl = getBaseUrl(config);
  const model = (config.model || 'gemini-pro').replace(/^models\//, '');
  const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${config.api_key}`;
  let currentMessages = [...messages];
  let enriched = false;

  for (let i = 0; i < 5; i++) {
    const { contents, systemInstruction } = convertToGeminiContents(currentMessages);
    const body = { contents, tools: toGeminiTools(toolDefs) };
    if (systemInstruction) body.systemInstruction = systemInstruction;
    body.generationConfig = { maxOutputTokens: i === 0 ? 1000 : config.max_tokens, temperature: 0 };

    let resp;
    try { resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: config.signal }); }
    catch { return enriched ? currentMessages : messages; }
    if (!resp.ok) return enriched ? currentMessages : messages;

    const data = await resp.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall);
    if (!functionCalls.length) return enriched ? currentMessages : messages;

    const textContent = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
    const openaiToolCalls = functionCalls.map((p, idx) => ({ id: `gc_${i}_${idx}`, type: 'function', function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {}) } }));
    currentMessages.push({ role: 'assistant', content: textContent || null, tool_calls: openaiToolCalls });
    for (let j = 0; j < functionCalls.length; j++) {
      const fc = functionCalls[j].functionCall;
      const fn = toolHandlers[fc.name];
      let result;
      try { result = fn ? String(await fn(fc.args || {})) : `工具未定义：${fc.name}`; }
      catch (e) { result = `工具执行失败：${e.message}`; }
      currentMessages.push({ role: 'tool', tool_call_id: openaiToolCalls[j].id, content: result });
    }
    enriched = true;
  }

  return enriched ? currentMessages : messages;
}
