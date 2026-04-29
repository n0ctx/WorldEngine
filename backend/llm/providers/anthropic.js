import { getBaseUrl, apiError, parseSSE, executeToolCall, resolveThinkingBudget } from './_utils.js';
import { convertToAnthropicMessages } from './_converters.js';
import { recordTokenUsage } from './cache-usage.js';
import { logRawRequest } from '../raw-logger.js';

// 将 system 字符串转为带 cache_control 的数组格式，启用 Anthropic Prompt Caching
function withCacheControl(system) {
  if (!system) return undefined;
  return [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
}

function toAnthropicTools(toolDefs) {
  return toolDefs.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

export async function* streamAnthropic(messages, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/v1/messages`;
  const { system, messages: converted } = convertToAnthropicMessages(messages);

  const budgetTokens = resolveThinkingBudget(config.thinking_level);
  const body = {
    model: config.model,
    messages: converted,
    max_tokens: config.max_tokens || 4096,
    stream: true,
  };
  // extended thinking 不兼容 temperature（必须为 1），有 thinking 时不传 temperature
  if (!budgetTokens && config.temperature != null) body.temperature = config.temperature;
  if (budgetTokens) body.thinking = { type: 'enabled', budget_tokens: budgetTokens };
  if (system) body.system = withCacheControl(system);

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': config.api_key,
    'anthropic-version': '2023-06-01',
  };
  const betas = ['prompt-caching-2024-07-31'];
  if (budgetTokens) betas.push('interleaved-thinking-2025-05-14');
  headers['anthropic-beta'] = betas.join(',');

  logRawRequest(body, config, config.callType || 'stream');
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: config.signal });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw apiError(`Anthropic API error: ${resp.status} ${text}`, resp.status);
  }

  // 跟踪当前是否在 thinking block 中（extended thinking 专用）
  let inThinkingBlock = false;

  for await (const { event, data } of parseSSE(resp.body)) {
    if (event === 'message_start') {
      try {
        const parsed = JSON.parse(data);
        const u = parsed.message?.usage;
        if (u && config.usageRef) {
          recordTokenUsage(config.usageRef, u, config.provider);
        }
      } catch { /* skip */ }
    } else if (event === 'message_delta') {
      try {
        const parsed = JSON.parse(data);
        const u = parsed.usage;
        if (u?.output_tokens != null && config.usageRef) {
          recordTokenUsage(config.usageRef, u, config.provider);
        }
      } catch { /* skip */ }
    } else if (event === 'content_block_start') {
      try {
        const parsed = JSON.parse(data);
        if (parsed.content_block?.type === 'thinking') {
          inThinkingBlock = true;
          yield '<think>';
        } else if (parsed.content_block?.type === 'text' && inThinkingBlock) {
          yield '</think>';
          inThinkingBlock = false;
        }
      } catch { /* skip */ }
    } else if (event === 'content_block_stop') {
      if (inThinkingBlock) {
        yield '</think>';
        inThinkingBlock = false;
      }
    } else if (event === 'content_block_delta') {
      try {
        const parsed = JSON.parse(data);
        if (parsed.delta?.type === 'thinking_delta') {
          yield parsed.delta.thinking || '';
        } else if (parsed.delta?.type === 'text_delta') {
          const text = parsed.delta.text;
          if (text) yield text;
        }
      } catch { /* skip */ }
    }
  }

  // 安全兜底：确保 thinking block 已关闭
  if (inThinkingBlock) yield '</think>';
}

export async function completeAnthropic(messages, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/v1/messages`;
  const { system, messages: converted } = convertToAnthropicMessages(messages);

  const budgetTokens = resolveThinkingBudget(config.thinking_level);
  const body = {
    model: config.model,
    messages: converted,
    max_tokens: config.max_tokens || 4096,
  };
  if (!budgetTokens && config.temperature != null) body.temperature = config.temperature;
  if (budgetTokens) body.thinking = { type: 'enabled', budget_tokens: budgetTokens };
  if (system) body.system = withCacheControl(system);

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': config.api_key,
    'anthropic-version': '2023-06-01',
  };
  const betasC = ['prompt-caching-2024-07-31'];
  if (budgetTokens) betasC.push('interleaved-thinking-2025-05-14');
  headers['anthropic-beta'] = betasC.join(',');

  logRawRequest(body, config, config.callType || 'complete');
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: config.signal });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw apiError(`Anthropic API error: ${resp.status} ${text}`, resp.status);
  }

  const data = await resp.json();
  if (data.usage && config.usageRef) {
    recordTokenUsage(config.usageRef, data.usage, config.provider);
  }
  return (data.content || []).map((block) => {
    if (block.type === 'thinking') return `<think>${block.thinking}</think>`;
    if (block.type === 'text') return block.text;
    return '';
  }).join('');
}

export async function completeAnthropicWithTools(messages, toolDefs, toolHandlers, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/v1/messages`;
  const headers = { 'Content-Type': 'application/json', 'x-api-key': config.api_key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31' };
  let currentMessages = [...messages];

  for (let i = 0; i < 5; i++) {
    const { system, messages: anthropicMsgs } = convertToAnthropicMessages(currentMessages);
    const body = { model: config.model, messages: anthropicMsgs, tools: toAnthropicTools(toolDefs), max_tokens: config.max_tokens || 4096 };
    if (config.temperature != null) body.temperature = config.temperature;
    if (system) body.system = withCacheControl(system);

    logRawRequest(body, config, config.callType ? `${config.callType}:tools` : 'complete-tools');
    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: config.signal });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      if (resp.status === 400 || resp.status === 422) return completeAnthropic(messages, config);
      throw apiError(`Anthropic API error: ${resp.status} ${text}`, resp.status);
    }

    const data = await resp.json();
    const content = data.content || [];
    const toolUseBlocks = content.filter((b) => b.type === 'tool_use');
    const textContent = content.filter((b) => b.type === 'text').map((b) => b.text).join('');

    if (!toolUseBlocks.length) return textContent;

    const openaiToolCalls = toolUseBlocks.map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input) } }));
    currentMessages.push({ role: 'assistant', content: textContent || null, tool_calls: openaiToolCalls });
    for (const block of toolUseBlocks) {
      const fn = toolHandlers[block.name];
      let result;
      try { result = fn ? String(await fn(block.input)) : `工具未定义：${block.name}`; }
      catch (e) { result = `工具执行失败：${e.message}`; }
      currentMessages.push({ role: 'tool', tool_call_id: block.id, content: result });
    }
  }

  return completeAnthropic(currentMessages, config);
}

export async function resolveToolContextAnthropic(messages, toolDefs, toolHandlers, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/v1/messages`;
  const headers = { 'Content-Type': 'application/json', 'x-api-key': config.api_key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31' };
  let currentMessages = [...messages];
  let enriched = false;

  for (let i = 0; i < 5; i++) {
    const { system, messages: anthropicMsgs } = convertToAnthropicMessages(currentMessages);
    const body = { model: config.model, messages: anthropicMsgs, tools: toAnthropicTools(toolDefs), max_tokens: i === 0 ? 1000 : (config.max_tokens || 4096), temperature: 0 };
    if (system) body.system = withCacheControl(system);

    logRawRequest(body, config, config.callType ? `${config.callType}:resolve` : 'resolve-tools');
    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: config.signal });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw apiError(`Anthropic API error: ${resp.status} ${text}`, resp.status);
    }

    const data = await resp.json();
    const content = data.content || [];
    const toolUseBlocks = content.filter((b) => b.type === 'tool_use');
    if (!toolUseBlocks.length) return enriched ? currentMessages : messages;

    const openaiToolCalls = toolUseBlocks.map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input) } }));
    const textContent = content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    currentMessages.push({ role: 'assistant', content: textContent || null, tool_calls: openaiToolCalls });
    for (const block of toolUseBlocks) {
      const fn = toolHandlers[block.name];
      let result;
      try { result = fn ? String(await fn(block.input)) : `工具未定义：${block.name}`; }
      catch (e) { result = `工具执行失败：${e.message}`; }
      currentMessages.push({ role: 'tool', tool_call_id: block.id, content: result });
    }
    enriched = true;
  }

  return enriched ? currentMessages : messages;
}
