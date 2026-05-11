import { getBaseUrl } from '../_shared/base-urls.js';
import { apiError, parseSSE } from '../_shared/fetch-utils.js';
import { resolveThinkingBudget } from '../_shared/thinking-budget.js';
import { convertToAnthropicMessages } from '../_shared/converters.js';
import { recordTokenUsage } from '../_shared/cache-usage.js';
import { ANTHROPIC_API_VERSION, ANTHROPIC_PROMPT_CACHING_BETA } from './constants.js';
import { logRawRequest } from '../../raw-logger.js';
import { createLogger, formatMeta } from '../../../utils/logger.js';
import { runToolLoop } from '../../tool-loop-control.js';

const log = createLogger('llm', 'magenta');

function logUsage(model, usage) {
  if (!usage) return;
  log.info('provider.usage', formatMeta({
    provider: 'anthropic',
    model,
    prompt_tokens: usage.input_tokens,
    completion_tokens: usage.output_tokens,
  }));
}

// 将 system 字符串转为带 cache_control 的数组格式,启用 Anthropic Prompt Caching。
// 若 config.cacheableSystem 提供了稳定前缀(assembler [1-3.5]),则把 system 拆成
// stable prefix + dynamic suffix 两段,cache_control 只标在 prefix 上 —— 避免 dynamic
// 段(时间/状态/附近角色等每轮变化)破坏 cache hash,等价于 openai-compatible 路径
// 已做的 normalizeOpenAICompatibleMessages 优化。
function withCacheControl(system, config) {
  if (!system) return undefined;
  const cacheable = config?.cacheableSystem;
  if (cacheable && system.startsWith(cacheable)) {
    const dynamic = system.slice(cacheable.length).replace(/^\s*\n+/, '');
    if (dynamic) {
      return [
        { type: 'text', text: cacheable, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: dynamic },
      ];
    }
  }
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
  log.debug('provider.request', formatMeta({ provider: 'anthropic', model: config.model, msgs: messages.length, mode: 'stream' }));
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
  // extended thinking 不兼容 temperature(必须为 1),有 thinking 时不传 temperature
  if (!budgetTokens && config.temperature != null) body.temperature = config.temperature;
  if (budgetTokens) body.thinking = { type: 'enabled', budget_tokens: budgetTokens };
  if (system) body.system = withCacheControl(system, config);

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': config.api_key,
    'anthropic-version': ANTHROPIC_API_VERSION,
  };
  const betas = [ANTHROPIC_PROMPT_CACHING_BETA];
  if (budgetTokens) betas.push('interleaved-thinking-2025-05-14');
  headers['anthropic-beta'] = betas.join(',');

  logRawRequest(body, config, config.callType || 'stream');
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: config.signal });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    log.error('provider.http_error', formatMeta({ provider: 'anthropic', status: resp.status, msg: text }));
    throw apiError(`Anthropic API error: ${resp.status} ${text}`, resp.status);
  }

  // 跟踪当前是否在 thinking block 中(extended thinking 专用)
  let inThinkingBlock = false;
  let lastUsage = null;

  for await (const { event, data } of parseSSE(resp.body)) {
    if (event === 'message_start') {
      try {
        const parsed = JSON.parse(data);
        const u = parsed.message?.usage;
        if (u) {
          lastUsage = { ...(lastUsage || {}), ...u };
          if (config.usageRef) recordTokenUsage(config.usageRef, u, config.provider);
        }
      } catch (err) { log.error('provider.parse_error', formatMeta({ provider: 'anthropic', msg: err.message })); }
    } else if (event === 'message_delta') {
      try {
        const parsed = JSON.parse(data);
        const u = parsed.usage;
        if (u?.output_tokens != null) {
          lastUsage = { ...(lastUsage || {}), ...u };
          if (config.usageRef) recordTokenUsage(config.usageRef, u, config.provider);
        }
      } catch (err) { log.error('provider.parse_error', formatMeta({ provider: 'anthropic', msg: err.message })); }
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
      } catch (err) { log.error('provider.parse_error', formatMeta({ provider: 'anthropic', msg: err.message })); }
    }
  }

  // 安全兜底:确保 thinking block 已关闭
  if (inThinkingBlock) yield '</think>';
  logUsage(config.model, lastUsage);
}

export async function completeAnthropic(messages, config) {
  log.debug('provider.request', formatMeta({ provider: 'anthropic', model: config.model, msgs: messages.length, mode: 'complete' }));
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
  if (system) body.system = withCacheControl(system, config);

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': config.api_key,
    'anthropic-version': ANTHROPIC_API_VERSION,
  };
  const betasC = [ANTHROPIC_PROMPT_CACHING_BETA];
  if (budgetTokens) betasC.push('interleaved-thinking-2025-05-14');
  headers['anthropic-beta'] = betasC.join(',');

  logRawRequest(body, config, config.callType || 'complete');
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: config.signal });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    log.error('provider.http_error', formatMeta({ provider: 'anthropic', status: resp.status, msg: text }));
    throw apiError(`Anthropic API error: ${resp.status} ${text}`, resp.status);
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    log.error('provider.parse_error', formatMeta({ provider: 'anthropic', msg: err.message }));
    throw err;
  }
  if (data.usage) {
    logUsage(config.model, data.usage);
    if (config.usageRef) recordTokenUsage(config.usageRef, data.usage, config.provider);
  }
  return (data.content || []).map((block) => {
    if (block.type === 'thinking') return `<think>${block.thinking}</think>`;
    if (block.type === 'text') return block.text;
    return '';
  }).join('');
}

// ---------- 工具循环 4 原语 provider ----------
//
// state 结构:{ messages }(OpenAI-style 累积消息;每轮 oneTurn 重新 convertToAnthropicMessages)
// turn   结构:{ kind, toolCalls?, assistantBlock?, text? }
//   - toolCalls   : OpenAI-style 兼容(供 handler 调度)
//   - assistantBlock: OpenAI-style 的 assistant 消息(textContent + tool_calls),append 用
const anthropicToolLoopProvider = {
  initState(messages) {
    return { messages: [...messages] };
  },

  async oneTurn(state, toolDefs, _iter, config) {
    const baseUrl = getBaseUrl(config);
    const url = `${baseUrl}/v1/messages`;
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': config.api_key,
      'anthropic-version': ANTHROPIC_API_VERSION,
      'anthropic-beta': ANTHROPIC_PROMPT_CACHING_BETA,
    };

    const { system, messages: anthropicMsgs } = convertToAnthropicMessages(state.messages);
    const body = {
      model: config.model,
      messages: anthropicMsgs,
      tools: toAnthropicTools(toolDefs),
      max_tokens: config.max_tokens || 4096,
    };
    if (config.temperature != null) body.temperature = config.temperature;
    if (system) body.system = withCacheControl(system, config);

    logRawRequest(body, config, config.callType ? `${config.callType}:tools` : 'complete-tools');
    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: config.signal });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      log.error('provider.http_error', formatMeta({ provider: 'anthropic', status: resp.status, msg: text }));
      // 400/422 退到无工具补全
      if (resp.status === 400 || resp.status === 422) return { kind: 'fallback' };
      throw apiError(`Anthropic API error: ${resp.status} ${text}`, resp.status);
    }

    const data = await resp.json();
    if (data.usage) logUsage(config.model, data.usage);
    const content = data.content || [];
    const toolUseBlocks = content.filter((b) => b.type === 'tool_use');
    const textContent = content.filter((b) => b.type === 'text').map((b) => b.text).join('');

    if (!toolUseBlocks.length) {
      return { kind: 'text', text: textContent };
    }

    const toolCalls = toolUseBlocks.map((b) => ({ id: b.id, name: b.name, arguments: b.input }));
    const openaiToolCalls = toolUseBlocks.map((b) => ({
      id: b.id,
      type: 'function',
      function: { name: b.name, arguments: JSON.stringify(b.input) },
    }));
    return {
      kind: 'tools',
      toolCalls,
      assistantBlock: { role: 'assistant', content: textContent || null, tool_calls: openaiToolCalls },
    };
  },

  appendToolTurn(state, turn, results) {
    const next = { ...state, messages: [...state.messages, turn.assistantBlock] };
    for (let i = 0; i < turn.toolCalls.length; i++) {
      next.messages.push({
        role: 'tool',
        tool_call_id: turn.toolCalls[i].id,
        content: results[i],
      });
    }
    return next;
  },

  async completeNoTools(state, config) {
    return completeAnthropic(state.messages, config);
  },

  stateToMessages(state) {
    return state.messages;
  },
};

export async function completeAnthropicWithTools(messages, toolDefs, toolHandlers, config) {
  log.debug('provider.request', formatMeta({ provider: 'anthropic', model: config.model, msgs: messages.length, mode: 'complete-tools' }));
  return runToolLoop({
    provider: anthropicToolLoopProvider,
    messages,
    toolDefs,
    toolHandlers,
    config,
    completeResultMode: config.toolResultMode ?? 'text',
  });
}
