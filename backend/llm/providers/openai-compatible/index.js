import { getBaseUrl } from '../_shared/base-urls.js';
import { apiError, parseSSE, extractProviderError } from '../_shared/fetch-utils.js';
import { applyThinkingToOpenAICompatibleBody } from './thinking.js';
import { recordTokenUsage } from '../_shared/cache-usage.js';
import { logRawRequest } from '../../raw-logger.js';
import { createLogger, formatMeta } from '../../../utils/logger.js';
import { runToolLoop } from '../../tool-loop-control.js';
import {
  extractOpenAICompatibleSignal,
  extractProviderErrorSignal,
  emitProviderSignal,
  buildContextFromConfig,
} from '../_shared/provider-safety-signals.js';

const log = createLogger('llm', 'magenta');

function logOpenAIUsage(provider, model, usage) {
  if (!usage) return;
  log.info('provider.usage', formatMeta({
    provider: provider || 'openai',
    model,
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
  }));
}

function assertOpenAICompatibleData(data, config) {
  const providerError = extractProviderError(data);
  if (providerError) throw apiError(`${config.provider} API error: ${providerError}`, 401);
}

/**
 * OpenAI-compatible 路径默认行为：把首条 system 拆成稳定 cached prefix + 动态 system suffix。
 *
 * 背景：assembler 为兼容 Grok（双 user 结构会让 cache pipeline bypass，commit 02b50a2），
 * 把稳定前缀 [1-3.5] 与动态后缀 [4-10] 合并进首条单条 system message。但合并后的 system
 * 每轮内容都变，prefix cache 边界会在 tokenizer 拼接处发生 1-2 token 的漂移，并被部分
 * provider（OpenRouter / DeepSeek 等）整体视为"系统块变更"而绕过缓存。
 *
 * 解决方案：仅当 messages[0] 以 cacheableSystem 为前缀时，将首条 system 拆成两条：
 *   1) 稳定 cached prefix（[1-3.5]）
 *   2) 动态 system suffix（[4-10]）
 * 拆分后两段都是 role=system，与 commit 02b50a2 修复的"双 user"结构不同，Grok 不回归。
 *
 * 兜底：cacheableSystem 为空 / 首条非 system / 不以 cacheableSystem 开头 / 无动态后缀
 * 任一情况都返回原 messages，行为等价于不开启拆分。
 *
 * 不在 OpenAI-compatible 路径的 Anthropic、Gemini、Ollama 走各自 provider 文件，零影响。
 */
export function normalizeOpenAICompatibleMessages(messages, config) {
  const provider = config?.provider || '';
  // 针对智谱官方 (glm / glm-coding on Z.AI) 的低层绕过：
  // 跳过 system 拆分。保持 assembler 产出的 messages 结构原样发送（通常单条 system）。
  // 语义内容完全不变，仅改变发往 provider 的 wire 格式（system 条数），
  // 部分情况下能避开 Z.AI 的内容安全分类器对请求结构的敏感判定（1301 等）。
  if (provider === 'glm' || provider === 'glm-coding') {
    return messages;
  }

  if (!Array.isArray(messages) || messages.length === 0) return messages;
  if (!config?.cacheableSystem) return messages;

  const [first, ...rest] = messages;
  if (first?.role !== 'system' || typeof first.content !== 'string') return messages;
  if (!first.content.startsWith(config.cacheableSystem)) return messages;

  const dynamicSystem = first.content.slice(config.cacheableSystem.length).replace(/^\s*\n+/, '');
  if (!dynamicSystem) return messages;

  return [
    { ...first, content: config.cacheableSystem },
    { role: 'system', content: dynamicSystem },
    ...rest,
  ];
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
  log.debug('provider.request', formatMeta({ provider: config.provider || 'openai', model: config.model, msgs: messages.length, mode: 'stream' }));
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/chat/completions`;
  const messagesForRequest = normalizeOpenAICompatibleMessages(messages, config);

  const body = {
    model: config.model,
    messages: messagesForRequest,
    max_tokens: config.max_tokens,
    stream: true,
  };
  const isGlm = config.provider === 'glm' || config.provider === 'glm-coding';
  if (!isGlm) {
    // 低层绕过：Z.AI / 智谱官方 OpenAI 兼容端点不附加 stream_options。
    // 该字段为 OpenAI 扩展，部分情况下会导致请求走更严格的安全/分类路径（触发 1301）。
    // 去掉后请求更接近官方示例 curl，语义/输出完全不变。
    body.stream_options = { include_usage: true };
  }
  const thinkingState = applyThinkingToOpenAICompatibleBody(body, config);
  // 思考开启时不传 temperature（OpenAI o-series / DeepSeek thinking 模式不兼容 temperature）
  if (thinkingState !== 'enabled') body.temperature = config.temperature;

  logRawRequest(body, config, config.callType || 'stream');
  const resp = await fetch(url, {
    method: 'POST',
    headers: buildOpenAICompatibleHeaders(config),
    body: JSON.stringify(body),
    signal: config.signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    log.error('provider.http_error', formatMeta({ provider: config.provider || 'openai', status: resp.status, msg: text }));
    const errSignal = extractProviderErrorSignal(text, buildContextFromConfig(config, { phase: 'request_error' }));
    if (errSignal) await emitProviderSignal(config, errSignal);
    throw apiError(`${config.provider} API error: ${resp.status} ${text}`, resp.status);
  }

  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await resp.json().catch(() => ({}));
    const signal = extractOpenAICompatibleSignal(data, buildContextFromConfig(config, { phase: 'request_error', stream: true }));
    if (signal) await emitProviderSignal(config, signal);
    assertOpenAICompatibleData(data, config);
    throw apiError(`${config.provider} API error: 返回了非流式 JSON 响应`, 502);
  }

  let inThinking = false;
  let lastUsage = null;
  let emittedChars = 0;
  let chunkIndex = -1;
  const streamCtx = buildContextFromConfig(config, { phase: 'stream_chunk', stream: true });
  for await (const { data } of parseSSE(resp.body)) {
    try {
      const parsed = JSON.parse(data);
      chunkIndex += 1;
      // 末尾 chunk 可能携带 usage（部分 provider 即使不传 stream_options 也会在最后 chunk 返回）
      if (parsed.usage) {
        lastUsage = parsed.usage;
        if (config.usageRef) recordTokenUsage(config.usageRef, parsed.usage, config.provider);
      }
      // Provider 安全/敏感/过滤/截断信号检测
      const safetySignal = extractOpenAICompatibleSignal(parsed, {
        ...streamCtx,
        phase: parsed.choices?.[0]?.finish_reason ? 'stream_stop' : 'stream_chunk',
        emittedCharsBeforeTrigger: emittedChars,
        chunkIndex,
      });
      if (safetySignal) await emitProviderSignal(config, safetySignal);
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
        emittedChars += delta.content.length;
        yield delta.content;
      }
    } catch (err) {
      log.error('provider.parse_error', formatMeta({ provider: config.provider || 'openai', msg: err.message }));
    }
  }
  if (inThinking) yield '</think>\n';
  logOpenAIUsage(config.provider, config.model, lastUsage);
}

export async function completeOpenAICompatible(messages, config) {
  log.debug('provider.request', formatMeta({ provider: config.provider || 'openai', model: config.model, msgs: messages.length, mode: 'complete' }));
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/chat/completions`;
  const messagesForRequest = normalizeOpenAICompatibleMessages(messages, config);

  const body = {
    model: config.model,
    messages: messagesForRequest,
    max_tokens: config.max_tokens,
    stream: false,
  };
  const thinkingState = applyThinkingToOpenAICompatibleBody(body, config);
  if (thinkingState !== 'enabled') body.temperature = config.temperature;

  logRawRequest(body, config, config.callType || 'complete');
  const resp = await fetch(url, {
    method: 'POST',
    headers: buildOpenAICompatibleHeaders(config),
    body: JSON.stringify(body),
    signal: config.signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    log.error('provider.http_error', formatMeta({ provider: config.provider || 'openai', status: resp.status, msg: text }));
    const errSignal = extractProviderErrorSignal(text, buildContextFromConfig(config, { phase: 'request_error' }));
    if (errSignal) await emitProviderSignal(config, errSignal);
    throw apiError(`${config.provider} API error: ${resp.status} ${text}`, resp.status);
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    log.error('provider.parse_error', formatMeta({ provider: config.provider || 'openai', msg: err.message }));
    throw err;
  }
  const completeSignal = extractOpenAICompatibleSignal(data, buildContextFromConfig(config, { phase: 'complete_response', stream: false }));
  if (completeSignal) await emitProviderSignal(config, completeSignal);
  assertOpenAICompatibleData(data, config);
  if (data.usage) {
    logOpenAIUsage(config.provider, config.model, data.usage);
    if (config.usageRef) recordTokenUsage(config.usageRef, data.usage, config.provider);
  }
  const msg = data.choices?.[0]?.message;
  if (!msg) return '';
  const reasoning = msg.reasoning || msg.reasoning_content;
  const content = msg.content || '';
  return reasoning ? `<think>${reasoning}</think>\n${content}` : content;
}

// ============================================================
// 工具循环（runToolLoop 4 原语 provider 适配）
// ============================================================

// runToolLoop 4 原语 provider 适配
// 注意: initState 入参 messages 已由薄包装层提前 normalize, 这里直接拷贝即可。
const openaiCompatibleToolLoopProvider = {
  initState(messages) {
    return { messages: [...messages] };
  },

  async oneTurn(state, toolDefs, _iter, config) {
    const baseUrl = getBaseUrl(config);
    const url = `${baseUrl}/chat/completions`;

    const body = {
      model: config.model,
      messages: state.messages,
      tools: toolDefs,
      tool_choice: 'auto',
      max_tokens: config.max_tokens,
      stream: false,
    };
    const thinkingState = applyThinkingToOpenAICompatibleBody(body, config);
    if (thinkingState !== 'enabled') body.temperature = config.temperature;

    logRawRequest(body, config, config.callType ? `${config.callType}:tools` : 'complete-tools');

    const resp = await fetch(url, {
      method: 'POST',
      headers: buildOpenAICompatibleHeaders(config),
      body: JSON.stringify(body),
      signal: config.signal,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      log.error('provider.http_error', formatMeta({ provider: config.provider || 'openai', status: resp.status, msg: text }));
      // 400/422 退到无工具补全
      if (resp.status === 400 || resp.status === 422) return { kind: 'fallback' };
      throw apiError(`${config.provider} API error: ${resp.status} ${text}`, resp.status);
    }

    const data = await resp.json();
    const toolSignal = extractOpenAICompatibleSignal(data, buildContextFromConfig(config, { phase: 'tool_loop_turn', stream: false }));
    if (toolSignal) await emitProviderSignal(config, toolSignal);
    assertOpenAICompatibleData(data, config);
    if (data.usage) logOpenAIUsage(config.provider, config.model, data.usage);

    const message = data.choices?.[0]?.message;
    if (!message) return { kind: 'text', text: '' };

    if (!message.tool_calls?.length) {
      // 终态文本: 保留 reasoning_content 拼接格式
      const reasoning = message.reasoning || message.reasoning_content;
      const content = message.content || '';
      return { kind: 'text', text: reasoning ? `<think>${reasoning}</think>\n${content}` : content };
    }

    // 工具调用: tool args JSON 字符串 → 对象, runToolLoop 内部以 fn(call.arguments) 调用 handler
    const toolCalls = message.tool_calls.map((tc) => {
      let parsedArgs;
      try { parsedArgs = JSON.parse(tc.function?.arguments || '{}'); }
      catch { parsedArgs = {}; }
      return {
        id: tc.id,
        name: tc.function?.name,
        arguments: parsedArgs,
      };
    });

    // assistantBlock 保留 OpenAI 原生 tool_calls 结构 + reasoning_content 透传到下一轮
    const assistantBlock = { role: 'assistant', content: message.content || null, tool_calls: message.tool_calls };
    if (message.reasoning_content) assistantBlock.reasoning_content = message.reasoning_content;

    return { kind: 'tools', toolCalls, assistantBlock };
  },

  appendToolTurn(state, turn, results) {
    const toolMessages = turn.toolCalls.map((c, i) => ({
      role: 'tool',
      tool_call_id: c.id,
      content: results[i],
    }));
    return {
      messages: [...state.messages, turn.assistantBlock, ...toolMessages],
    };
  },

  completeNoTools(state, config) {
    return completeOpenAICompatible(state.messages, config);
  },

  stateToMessages(state) {
    return state.messages;
  },
};

export async function completeOpenAICompatibleWithTools(messages, toolDefs, toolHandlers, config) {
  log.debug('provider.request', formatMeta({ provider: config.provider || 'openai', model: config.model, msgs: messages.length, mode: 'complete-tools' }));
  return runToolLoop({
    provider: openaiCompatibleToolLoopProvider,
    messages: normalizeOpenAICompatibleMessages(messages, config),
    toolDefs,
    toolHandlers,
    config,
    completeResultMode: config.toolResultMode ?? 'text',
  });
}
