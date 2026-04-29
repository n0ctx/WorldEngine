import { getBaseUrl, apiError, parseSSE, executeToolCall, extractProviderError } from './_utils.js';
import { recordTokenUsage } from './cache-usage.js';
import { logRawRequest } from '../raw-logger.js';

/** thinking_level → OpenAI reasoning_effort */
function resolveReasoningEffort(thinking_level) {
  if (!thinking_level || !thinking_level.startsWith('effort_')) return null;
  return thinking_level.replace('effort_', '');
}

function assertOpenAICompatibleData(data, config) {
  const providerError = extractProviderError(data);
  if (providerError) throw apiError(`${config.provider} API error: ${providerError}`, 401);
}

/**
 * 构造请求头：xAI/Grok 在有 conversationId 时附加 x-grok-conv-id，
 * 用于把同一会话路由到同一缓存服务器，最大化 prompt cache 命中。
 * 其他 provider 不附加（避免被错误识别为非法字段）。
 */
export function buildOpenAICompatibleHeaders(config) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.api_key}`,
  };
  if (config.provider === 'grok' && config.conversationId) {
    headers['x-grok-conv-id'] = String(config.conversationId);
  }
  return headers;
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
    stream_options: { include_usage: true },
  };
  // reasoning_effort 不兼容 temperature，有 effort 时不传 temperature
  if (effort) {
    body.reasoning_effort = effort;
  } else {
    body.temperature = config.temperature;
  }

  logRawRequest(body, config, config.callType || 'stream');
  const resp = await fetch(url, {
    method: 'POST',
    headers: buildOpenAICompatibleHeaders(config),
    body: JSON.stringify(body),
    signal: config.signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw apiError(`${config.provider} API error: ${resp.status} ${text}`, resp.status);
  }

  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await resp.json().catch(() => ({}));
    assertOpenAICompatibleData(data, config);
    throw apiError(`${config.provider} API error: 返回了非流式 JSON 响应`, 502);
  }

  let inThinking = false;
  for await (const { data } of parseSSE(resp.body)) {
    try {
      const parsed = JSON.parse(data);
      // 末尾 chunk 携带 usage（stream_options.include_usage: true）
      if (parsed.usage && config.usageRef) {
        recordTokenUsage(config.usageRef, parsed.usage, config.provider);
      }
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

  logRawRequest(body, config, config.callType || 'complete');
  const resp = await fetch(url, {
    method: 'POST',
    headers: buildOpenAICompatibleHeaders(config),
    body: JSON.stringify(body),
    signal: config.signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw apiError(`${config.provider} API error: ${resp.status} ${text}`, resp.status);
  }

  const data = await resp.json();
  assertOpenAICompatibleData(data, config);
  if (data.usage && config.usageRef) {
    recordTokenUsage(config.usageRef, data.usage, config.provider);
  }
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

    logRawRequest(body, config, config.callType ? `${config.callType}:tools` : 'complete-tools');
    const resp = await fetch(url, {
      method: 'POST',
      headers: buildOpenAICompatibleHeaders(config),
      body: JSON.stringify(body),
      signal: config.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      if (resp.status === 400 || resp.status === 422) return completeOpenAICompatible(currentMessages, config);
      throw apiError(`${config.provider} API error: ${resp.status} ${text}`, resp.status);
    }

    const data = await resp.json();
    assertOpenAICompatibleData(data, config);
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

    logRawRequest(body, config, config.callType ? `${config.callType}:resolve` : 'resolve-tools');
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.api_key}` }, body: JSON.stringify(body), signal: config.signal });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw apiError(`${config.provider} API error: ${resp.status} ${text}`, resp.status);
    }

    const data = await resp.json();
    assertOpenAICompatibleData(data, config);
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
