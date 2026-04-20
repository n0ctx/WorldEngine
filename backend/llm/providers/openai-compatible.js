import { getBaseUrl, apiError, parseSSE, executeToolCall } from './_utils.js';

/** thinking_level → OpenAI reasoning_effort */
function resolveReasoningEffort(thinking_level) {
  if (!thinking_level || !thinking_level.startsWith('effort_')) return null;
  return thinking_level.replace('effort_', '');
}

export async function* streamOpenAICompatible(messages, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/chat/completions`;

  const effort = resolveReasoningEffort(config.thinking_level);
  const body = {
    model: config.model,
    messages,
    max_tokens: config.max_tokens,
    stream: true,
  };
  // reasoning_effort 不兼容 temperature，有 effort 时不传 temperature
  if (effort) {
    body.reasoning_effort = effort;
  } else {
    body.temperature = config.temperature;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.api_key}` },
    body: JSON.stringify(body),
    signal: config.signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw apiError(`${config.provider} API error: ${resp.status} ${text}`, resp.status);
  }

  let inThinking = false;
  for await (const { data } of parseSSE(resp.body)) {
    try {
      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta;
      if (!delta) continue;
      // OpenRouter 等 provider 将推理内容放在 reasoning / reasoning_content 字段
      const reasoning = delta.reasoning || delta.reasoning_content;
      if (reasoning) {
        if (!inThinking) { yield '<think>'; inThinking = true; }
        yield reasoning;
      }
      if (delta.content) {
        if (inThinking) { yield '</think>\n'; inThinking = false; }
        yield delta.content;
      }
    } catch {
      // 跳过无法解析的行
    }
  }
  if (inThinking) yield '</think>\n';
}

export async function completeOpenAICompatible(messages, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/chat/completions`;

  const effort = resolveReasoningEffort(config.thinking_level);
  const body = {
    model: config.model,
    messages,
    max_tokens: config.max_tokens,
    stream: false,
  };
  if (effort) {
    body.reasoning_effort = effort;
  } else {
    body.temperature = config.temperature;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.api_key}` },
    body: JSON.stringify(body),
    signal: config.signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw apiError(`${config.provider} API error: ${resp.status} ${text}`, resp.status);
  }

  const data = await resp.json();
  const msg = data.choices?.[0]?.message;
  if (!msg) return '';
  const reasoning = msg.reasoning || msg.reasoning_content;
  const content = msg.content || '';
  return reasoning ? `<think>${reasoning}</think>\n${content}` : content;
}

export async function completeOpenAICompatibleWithTools(messages, toolDefs, toolHandlers, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/chat/completions`;
  let currentMessages = [...messages];

  for (let i = 0; i < 5; i++) {
    const effort = resolveReasoningEffort(config.thinking_level);
    const body = { model: config.model, messages: currentMessages, tools: toolDefs, tool_choice: 'auto', max_tokens: config.max_tokens, stream: false };
    if (effort) body.reasoning_effort = effort;
    else body.temperature = config.temperature;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.api_key}` },
      body: JSON.stringify(body),
      signal: config.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      if (resp.status === 400 || resp.status === 422) return completeOpenAICompatible(currentMessages, config);
      throw apiError(`${config.provider} API error: ${resp.status} ${text}`, resp.status);
    }

    const data = await resp.json();
    const message = data.choices?.[0]?.message;
    if (!message) return '';

    if (!message.tool_calls?.length) {
      const reasoning = message.reasoning || message.reasoning_content;
      const content = message.content || '';
      return reasoning ? `<think>${reasoning}</think>\n${content}` : content;
    }

    currentMessages.push({ role: 'assistant', content: message.content || null, tool_calls: message.tool_calls });
    for (const tc of message.tool_calls) {
      currentMessages.push({ role: 'tool', tool_call_id: tc.id, content: await executeToolCall(tc, toolHandlers) });
    }
  }

  return completeOpenAICompatible(currentMessages, config);
}

export async function resolveToolContextOpenAI(messages, toolDefs, toolHandlers, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/chat/completions`;
  let currentMessages = [...messages];
  let enriched = false;

  for (let i = 0; i < 5; i++) {
    const effort = resolveReasoningEffort(config.thinking_level);
    const body = { model: config.model, messages: currentMessages, tools: toolDefs, tool_choice: 'auto', max_tokens: i === 0 ? 1000 : config.max_tokens, stream: false };
    if (effort) body.reasoning_effort = effort;
    else body.temperature = config.temperature ?? 0;

    let resp;
    try {
      resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.api_key}` }, body: JSON.stringify(body), signal: config.signal });
    } catch { return enriched ? currentMessages : messages; }
    if (!resp.ok) return enriched ? currentMessages : messages;

    const data = await resp.json();
    const message = data.choices?.[0]?.message;
    if (!message || !message.tool_calls?.length) return enriched ? currentMessages : messages;

    currentMessages.push({ role: 'assistant', content: message.content || null, tool_calls: message.tool_calls });
    for (const tc of message.tool_calls) {
      currentMessages.push({ role: 'tool', tool_call_id: tc.id, content: await executeToolCall(tc, toolHandlers) });
    }
    enriched = true;
  }

  return enriched ? currentMessages : messages;
}
