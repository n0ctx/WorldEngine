/**
 * 本地 LLM Provider 适配 — Ollama / LM Studio
 *
 * 两者均使用 OpenAI-compatible /v1/chat/completions 接口
 */

const DEFAULT_BASE_URLS = {
  ollama: 'http://localhost:11434',
  lmstudio: 'http://localhost:1234',
};

function getBaseUrl(config) {
  return (config.base_url || DEFAULT_BASE_URLS[config.provider] || '').replace(/\/+$/, '');
}

function apiError(message, status, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

async function* parseSSE(body) {
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        yield data;
      }
    }
  }
}

export async function* streamChat(messages, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/v1/chat/completions`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      stream: true,
    }),
    signal: config.signal,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw apiError(`${config.provider} API error: ${resp.status} ${body}`, resp.status);
  }

  for await (const data of parseSSE(resp.body)) {
    try {
      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    } catch {
      // skip
    }
  }
}

export async function complete(messages, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/v1/chat/completions`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      stream: false,
    }),
    signal: config.signal,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw apiError(`${config.provider} API error: ${resp.status} ${body}`, resp.status);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

// ============================================================
// Tool-use（OpenAI-compatible 格式，支持工具调用的本地模型）
// ============================================================

async function callWithTools(messages, toolDefs, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/v1/chat/completions`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages,
      tools: toolDefs,
      tool_choice: 'auto',
      temperature: config.temperature,
      max_tokens: config.max_tokens,
      stream: false,
    }),
    signal: config.signal,
  });
  if (!resp.ok) return null; // 降级信号
  return resp.json();
}

export async function completeWithTools(messages, toolDefs, toolHandlers, config) {
  let currentMessages = [...messages];

  for (let i = 0; i < 5; i++) {
    const data = await callWithTools(currentMessages, toolDefs, config).catch(() => null);
    if (!data) return complete(currentMessages, config); // 模型不支持 tool-use，降级

    const message = data.choices?.[0]?.message;
    if (!message) return '';

    if (!message.tool_calls?.length) return message.content || '';

    currentMessages.push({ role: 'assistant', content: message.content || null, tool_calls: message.tool_calls });
    for (const tc of message.tool_calls) {
      const fn = toolHandlers[tc.function?.name];
      let result;
      try { result = fn ? String(await fn(JSON.parse(tc.function.arguments || '{}'))) : `工具未定义：${tc.function?.name}`; }
      catch (e) { result = `工具执行失败：${e.message}`; }
      currentMessages.push({ role: 'tool', tool_call_id: tc.id, content: result });
    }
  }

  return complete(currentMessages, config);
}

export async function resolveToolContext(messages, toolDefs, toolHandlers, config) {
  let currentMessages = [...messages];
  let enriched = false;

  for (let i = 0; i < 5; i++) {
    const overrideConfig = i === 0 ? { ...config, max_tokens: 200, temperature: 0 } : { ...config, temperature: 0 };
    const data = await callWithTools(currentMessages, toolDefs, overrideConfig).catch(() => null);
    if (!data) return enriched ? currentMessages : messages;

    const message = data.choices?.[0]?.message;
    if (!message || !message.tool_calls?.length) return enriched ? currentMessages : messages;

    currentMessages.push({ role: 'assistant', content: message.content || null, tool_calls: message.tool_calls });
    for (const tc of message.tool_calls) {
      const fn = toolHandlers[tc.function?.name];
      let result;
      try { result = fn ? String(await fn(JSON.parse(tc.function.arguments || '{}'))) : `工具未定义：${tc.function?.name}`; }
      catch (e) { result = `工具执行失败：${e.message}`; }
      currentMessages.push({ role: 'tool', tool_call_id: tc.id, content: result });
    }
    enriched = true;
  }

  return enriched ? currentMessages : messages;
}
