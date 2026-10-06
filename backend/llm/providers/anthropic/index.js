import { getBaseUrl } from '../_shared/base-urls.js';
import { apiError, parseSSE } from '../_shared/fetch-utils.js';
import { resolveThinkingBudget, resolveThinkingEffort } from '../_shared/thinking-budget.js';
import { isThinkingLevelSupported } from '../../../utils/constants.js';
import { convertToAnthropicMessages } from '../_shared/converters.js';
import { cacheUsageLogFields, recordTokenUsage } from '../_shared/cache-usage.js';
import { ANTHROPIC_API_VERSION, ANTHROPIC_PROMPT_CACHING_BETA } from './constants.js';
import { logRawRequest } from '../../raw-logger.js';
import { fetchAndRecord, readErrorAndRecord, readJsonAndRecord, recordStream } from '../../raw-recorder.js';
import { createLogger, formatMeta } from '../../../utils/logger.js';
import { runToolLoop } from '../../tool-loop-control.js';
import {
  extractAnthropicSignal,
  extractProviderErrorSignal,
  emitProviderSignal,
  buildContextFromConfig,
} from '../_shared/provider-safety-signals.js';

const log = createLogger('llm', 'magenta');

function logUsage(config, usage) {
  if (!usage) return;
  log.info('provider.usage', formatMeta({
    provider: 'anthropic',
    model: config.model,
    callType: config.callType,
    prompt_tokens: usage.input_tokens,
    completion_tokens: usage.output_tokens,
    ...cacheUsageLogFields(usage, config.provider),
  }));
}

/**
 * 走 Anthropic 适配器的各 provider 的思考字段（只接受 shared/thinking-levels.mjs 里该 provider 列出的档位）：
 * - anthropic：强度档用 thinking.type=adaptive + output_config.effort（4.6 及以上；4.7 起不再接受 budget_tokens），
 *   预算档用 thinking.budget_tokens（4.5 及更早）
 * - minimax-coding：只认 thinking.type adaptive / disabled，不认 budget_tokens
 * - kimi-coding（K3 / K2.8 Preview）：强度档用 output_config.effort low/high/max（与 Claude Code 接入 Kimi 时一致），
 *   关闭用 thinking.type=disabled
 */
function resolveThinkingFields(config) {
  const { provider, thinking_level: level } = config;
  if (!level || !isThinkingLevelSupported(provider, level)) return {};
  const effort = resolveThinkingEffort(level);
  if (level === 'thinking_disabled') return { thinking: { type: 'disabled' } };
  if (provider === 'kimi-coding') return { output_config: { effort } };
  if (provider === 'minimax-coding') return { thinking: { type: 'adaptive' } };
  if (effort) return { thinking: { type: 'adaptive' }, output_config: { effort } };
  return { thinking: { type: 'enabled', budget_tokens: resolveThinkingBudget(level) } };
}

const CLAUDE_MODEL_VERSION = /claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d)(?!\d))?/;

/**
 * Claude 的新模型（Opus 4.7 起、Sonnet 5 起、Fable / Mythos）不接受自定义 temperature，发了即 400；
 * 只按 anthropic 的官方模型名判断，认不出的模型名和其他走本适配器的 provider 照常发送。
 */
function acceptsTemperature(config) {
  if (config.provider !== 'anthropic') return true;
  const match = CLAUDE_MODEL_VERSION.exec(config.model || '');
  if (!match) return true;
  const [, family, major, minor = '0'] = match;
  const version = Number(major) + Number(minor) / 10;
  if (family === 'fable' || family === 'mythos') return false;
  if (family === 'opus') return version < 4.7;
  if (family === 'sonnet') return version < 5;
  return true;
}

function resolveTemperature(config, thinkingOn) {
  // 思考开启时同样不兼容自定义 temperature（必须为 1）
  if (thinkingOn || config.temperature == null || !acceptsTemperature(config)) return undefined;
  return config.temperature;
}

// 将 system 字符串转为带 cache_control 的数组格式,启用 Anthropic Prompt Caching。
// 若 config.cacheableSystem 提供了稳定前缀(assembler [1-4]),则把 system 拆成
// stable prefix + 后缀(剧情摘要,随短期窗口滑动变化)两段,cache_control 只标在 prefix 上 ——
// 后缀变化时稳定前缀仍可命中,等价于 openai-compatible 路径已做的 normalizeOpenAICompatibleMessages 优化。
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

// 工具循环内：把当前轮的原始 usage 累加进 usageRef，让多轮工具循环的开销可见、可对账。
// recordTokenUsage 是"覆盖"语义（单请求快照），工具循环需要"跨轮累加"，故单独累加。
function accumulateUsageRef(usageRef, usage) {
  if (!usageRef || !usage) return;
  const add = (key, value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      usageRef[key] = (Number.isFinite(usageRef[key]) ? usageRef[key] : 0) + value;
    }
  };
  add('prompt_tokens', usage.input_tokens);
  add('completion_tokens', usage.output_tokens);
  add('cache_creation_tokens', usage.cache_creation_input_tokens);
  add('cache_read_tokens', usage.cache_read_input_tokens);
}

// 在 messages[index] 的末尾内容块上打 ephemeral cache 断点，配合 system 上已有的断点，
// 让"system + 已稳定历史"前缀跨轮命中 prompt cache。每轮都标记新位置，相邻两轮的断点间隔约 1-2 块，
// 天然落在 Anthropic 20-block 回看窗口内。
// content 既可能是 string 也可能是 block 数组（如 tool_result），两种都处理。
function markMessageCacheable(messages, index) {
  const msg = messages?.[index];
  if (!msg || typeof msg !== 'object') return;
  if (typeof msg.content === 'string') {
    msg.content = [{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } }];
  } else if (Array.isArray(msg.content) && msg.content.length > 0) {
    const block = msg.content[msg.content.length - 1];
    if (block && typeof block === 'object') block.cache_control = { type: 'ephemeral' };
  }
}

// 主对话 / 写作：最后一条 user 携带每轮变化的上下文，断点打在它前一条（历史末尾）
function markHistoryCacheable(messages) {
  const lastUserIndex = messages.findLastIndex((msg) => msg.role === 'user');
  if (lastUserIndex > 0) markMessageCacheable(messages, lastUserIndex - 1);
}

async function processAnthropicMetadataEvent(event, data, config, lastUsage, meta) {
  try {
    const parsed = JSON.parse(data);
    if (event === 'message_start') {
      const usage = parsed.message?.usage;
      if (usage) {
        lastUsage = { ...(lastUsage || {}), ...usage };
        if (config.usageRef) recordTokenUsage(config.usageRef, usage, config.provider);
      }
    } else if (event === 'message_delta') {
      meta.finishReason = parsed.delta?.stop_reason;
      const usage = parsed.usage;
      if (usage?.output_tokens != null) {
        lastUsage = { ...(lastUsage || {}), ...usage };
        if (config.usageRef) recordTokenUsage(config.usageRef, usage, config.provider);
      }
      const signal = extractAnthropicSignal(
        parsed,
        buildContextFromConfig(config, { phase: 'stream_stop', stream: true }),
      );
      if (signal) await emitProviderSignal(config, signal);
    } else {
      const signal = extractAnthropicSignal(
        parsed,
        buildContextFromConfig(config, { phase: 'stream_chunk', stream: true }),
      );
      if (signal) await emitProviderSignal(config, signal);
    }
  } catch (err) {
    if (event !== 'error') {
      log.error('provider.parse_error', formatMeta({ provider: 'anthropic', msg: err.message }));
    }
  }
  return lastUsage;
}

function messagesUrl(config) {
  return `${getBaseUrl(config)}/v1/messages`;
}

/** stream / complete 共用的请求体与请求头（含思考字段与 beta 头） */
function buildMessagesRequest(messages, config, { stream }) {
  const { system, messages: converted } = convertToAnthropicMessages(messages);
  markHistoryCacheable(converted);
  const thinkingFields = resolveThinkingFields(config);
  const thinkingOn = Object.keys(thinkingFields).length > 0 && thinkingFields.thinking?.type !== 'disabled';
  const body = {
    model: config.model,
    messages: converted,
    max_tokens: config.max_tokens || 4096,
    ...thinkingFields,
  };
  if (stream) body.stream = true;
  const temperature = resolveTemperature(config, thinkingOn);
  if (temperature !== undefined) body.temperature = temperature;
  if (system) body.system = withCacheControl(system, config);

  const betas = [ANTHROPIC_PROMPT_CACHING_BETA];
  // 交错思考只有预算模式（4.5 及更早）需要 beta 头，adaptive 模式自带
  if (thinkingFields.thinking?.budget_tokens) betas.push('interleaved-thinking-2025-05-14');
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': config.api_key,
    'anthropic-version': ANTHROPIC_API_VERSION,
    'anthropic-beta': betas.join(','),
  };
  return { body, headers };
}

/** stream / complete 共用：发出请求，HTTP 失败时抛错；返回响应与原始日志记录器 */
async function postMessages(messages, config, { stream }) {
  const { body, headers } = buildMessagesRequest(messages, config, { stream });
  const raw = logRawRequest(body, config, config.callType || (stream ? 'stream' : 'complete'));
  const resp = await fetchAndRecord(messagesUrl(config), { method: 'POST', headers, body: JSON.stringify(body), signal: config.signal }, raw);
  if (!resp.ok) await throwAnthropicHttpError(resp, config, raw);
  return { resp, raw };
}

async function throwAnthropicHttpError(resp, config, raw) {
  const text = await readErrorAndRecord(resp, raw, 'anthropic');
  const errSignal = extractProviderErrorSignal(text, buildContextFromConfig(config, { phase: 'request_error' }));
  if (errSignal) await emitProviderSignal(config, errSignal);
  throw apiError(`Anthropic API error: ${resp.status} ${text}`, resp.status);
}

export async function* streamAnthropic(messages, config) {
  log.debug('provider.request', formatMeta({ provider: 'anthropic', model: config.model, msgs: messages.length, mode: 'stream' }));
  const { resp, raw } = await postMessages(messages, config, { stream: true });
  yield* recordStream(raw, readAnthropicStream, resp, config);
}

async function* readAnthropicStream(resp, config, meta) {
  let inThinkingBlock = false;
  let lastUsage = null;

  for await (const { event, data } of parseSSE(resp.body)) {
    if (event === 'message_start' || event === 'message_delta' || event === 'error') {
      lastUsage = await processAnthropicMetadataEvent(event, data, config, lastUsage, meta);
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
  meta.usage = lastUsage;
  logUsage(config, lastUsage);
}

export async function completeAnthropic(messages, config) {
  log.debug('provider.request', formatMeta({ provider: 'anthropic', model: config.model, msgs: messages.length, mode: 'complete' }));
  const { resp, raw } = await postMessages(messages, config, { stream: false });

  let data;
  try {
    data = await readJsonAndRecord(resp, raw);
  } catch (err) {
    log.error('provider.parse_error', formatMeta({ provider: 'anthropic', msg: err.message }));
    throw err;
  }
  const completeSig = extractAnthropicSignal(data, buildContextFromConfig(config, { phase: 'complete_response', stream: false }));
  if (completeSig) await emitProviderSignal(config, completeSig);
  if (data.usage) {
    logUsage(config, data.usage);
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
    const url = messagesUrl(config);
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': config.api_key,
      'anthropic-version': ANTHROPIC_API_VERSION,
      'anthropic-beta': ANTHROPIC_PROMPT_CACHING_BETA,
    };

    const { system, messages: anthropicMsgs } = convertToAnthropicMessages(state.messages);
    // 累积工具循环历史每轮都重发，给最近一条消息打 ephemeral 断点，让前缀跨轮命中 prompt cache。
    markMessageCacheable(anthropicMsgs, anthropicMsgs.length - 1);
    const body = {
      model: config.model,
      messages: anthropicMsgs,
      tools: toAnthropicTools(toolDefs),
      max_tokens: config.max_tokens || 4096,
    };
    const temperature = resolveTemperature(config, false);
    if (temperature !== undefined) body.temperature = temperature;
    if (system) body.system = withCacheControl(system, config);

    const raw = logRawRequest(body, config, config.callType ? `${config.callType}:tools` : 'complete-tools');
    const resp = await fetchAndRecord(url, { method: 'POST', headers, body: JSON.stringify(body), signal: config.signal }, raw);
    if (!resp.ok) {
      const text = await readErrorAndRecord(resp, raw, 'anthropic');
      // 400/422 退到无工具补全
      if (resp.status === 400 || resp.status === 422) return { kind: 'fallback' };
      throw apiError(`Anthropic API error: ${resp.status} ${text}`, resp.status);
    }

    const data = await readJsonAndRecord(resp, raw);
    const toolSig = extractAnthropicSignal(data, buildContextFromConfig(config, { phase: 'tool_loop_turn', stream: false }));
    if (toolSig) await emitProviderSignal(config, toolSig);
    if (data.usage) {
      logUsage(config, data.usage);
      if (config.usageRef) accumulateUsageRef(config.usageRef, data.usage);
    }
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
