/**
 * 本地 LLM Provider 适配 — Ollama / LM Studio / llama.cpp
 *
 * 三者均使用 OpenAI-compatible /v1/chat/completions 接口
 */

import {
  OLLAMA_DEFAULT_BASE_URL,
  LMSTUDIO_DEFAULT_BASE_URL,
  LLAMACPP_DEFAULT_BASE_URL,
} from '../../../utils/constants.js';
import { applyThinkingToOpenAICompatibleBody } from '../openai-compatible/thinking.js';
import { runToolLoop } from '../../tool-loop-control.js';
import { appendOpenAIToolTurn, normalizeOpenAIToolCalls } from '../_shared/converters.js';
import { emitProviderSignal, buildContextFromConfig, hashText } from '../_shared/provider-safety-signals.js';
import { logRawRequest } from '../../raw-logger.js';
import { fetchAndRecord, readJsonAndRecord, recordStream } from '../../raw-recorder.js';
import crypto from 'node:crypto';

function makeLocalErrorSignal(config, status, body, phase) {
  const ctx = buildContextFromConfig(config, { phase });
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...ctx,
    signalFamily: 'operational',
    signalName: 'local_provider_error',
    severity: 'medium',
    action: 'request_blocked_by_provider',
    providerErrorCode: String(status),
    providerErrorMessageHash: hashText(body),
  };
}

const DEFAULT_BASE_URLS = {
  ollama: OLLAMA_DEFAULT_BASE_URL,
  lmstudio: LMSTUDIO_DEFAULT_BASE_URL,
  llamacpp: LLAMACPP_DEFAULT_BASE_URL,
};

// 统一拼 /v1/chat/completions 请求体，并按 provider 注入 thinking/effort 字段。
// ollama / llamacpp 的思考档位按 thinking.js 写入（按请求覆盖 server 默认值）；
// lmstudio 的兼容接口不认思考参数，走 default 分支不写任何字段。
function buildLocalChatBody({ messages, stream, extra = {} }, config) {
  const body = {
    model: config.model,
    messages,
    temperature: config.temperature,
    max_tokens: config.max_tokens,
    stream,
    ...extra,
  };
  applyThinkingToOpenAICompatibleBody(body, config);
  return body;
}

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

async function throwLocalHttpError(resp, config, raw) {
  const body = await resp.text().catch(() => '');
  raw?.error({ status: resp.status, text: body });
  await emitProviderSignal(config, makeLocalErrorSignal(config, resp.status, body, 'request_error'));
  throw apiError(`${config.provider} API error: ${resp.status} ${body}`, resp.status);
}

/** 拼请求体、落原始日志并发出请求；返回响应与原始日志记录器 */
async function postLocalChat(config, { messages, stream, extra }, callType) {
  const body = buildLocalChatBody({ messages, stream, extra }, config);
  const raw = logRawRequest(body, config, callType);
  const resp = await fetchAndRecord(`${getBaseUrl(config)}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: config.signal,
  }, raw);
  return { resp, raw };
}

export async function* streamChat(messages, config) {
  const { resp, raw } = await postLocalChat(config, { messages, stream: true }, config.callType || 'stream');
  if (!resp.ok) await throwLocalHttpError(resp, config, raw);

  yield* recordStream(raw, readLocalStream, resp, config);
}

async function* readLocalStream(resp, config, meta) {
  let inThinking = false;
  for await (const data of parseSSE(resp.body)) {
    try {
      const parsed = JSON.parse(data);
      if (parsed.usage) {
        meta.usage = parsed.usage;
        if (config.usageRef) {
          const u = parsed.usage;
          if (u.prompt_tokens != null) config.usageRef.prompt_tokens = u.prompt_tokens;
          if (u.completion_tokens != null) config.usageRef.completion_tokens = u.completion_tokens;
        }
      }
      if (parsed.choices?.[0]?.finish_reason) meta.finishReason = parsed.choices[0].finish_reason;
      const delta = parsed.choices?.[0]?.delta;
      if (!delta) continue;
      // llama.cpp（--jinja）/ LM Studio 将推理内容放在 reasoning_content / reasoning 字段，与 openai-compatible 同样包成 <think>
      const reasoning = delta.reasoning_content || delta.reasoning;
      if (reasoning) {
        if (!inThinking) { yield '<think>'; inThinking = true; }
        yield reasoning;
      }
      if (delta.content) {
        if (inThinking) { yield '</think>\n'; inThinking = false; }
        yield delta.content;
      }
    } catch {
      // skip
    }
  }
  if (inThinking) yield '</think>\n';
}

function withReasoning(message) {
  const reasoning = message?.reasoning_content || message?.reasoning;
  const content = message?.content || '';
  return reasoning ? `<think>${reasoning}</think>\n${content}` : content;
}

export async function complete(messages, config) {
  const { resp, raw } = await postLocalChat(config, { messages, stream: false }, config.callType || 'complete');
  if (!resp.ok) await throwLocalHttpError(resp, config, raw);

  const data = await readJsonAndRecord(resp, raw);
  return withReasoning(data.choices?.[0]?.message);
}

// ============================================================
// Tool-use（OpenAI-compatible 格式，支持工具调用的本地模型）
// ============================================================

// 这些状态码表示接口不认工具调用请求（旧版本服务、模型模板不支持等），降级为无工具补全
const TOOL_UNSUPPORTED_STATUSES = new Set([400, 404, 422, 501]);
// llama.cpp / LM Studio 在模板渲染工具失败时报 500，正文带这些字样
const TOOL_UNSUPPORTED_BODY_RE = /tool|jinja|template|function/i;

/** 工具请求的失败响应是否表示「接口不支持工具调用」；其余失败（普通 5xx 等）照常抛出，交给单次请求重试 */
export function isToolUnsupportedResponse(status, bodyText) {
  if (TOOL_UNSUPPORTED_STATUSES.has(status)) return true;
  return status === 500 && TOOL_UNSUPPORTED_BODY_RE.test(bodyText || '');
}

// 返回 null 表示降级信号；网络错误、中止、超时与普通 5xx 一律抛出
async function callWithTools(messages, toolDefs, config) {
  const { resp, raw } = await postLocalChat(config, {
    messages,
    stream: false,
    extra: { tools: toolDefs, tool_choice: 'auto' },
  }, config.callType ? `${config.callType}:tools` : 'complete-tools');
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    raw?.error({ status: resp.status, text });
    if (isToolUnsupportedResponse(resp.status, text)) return null;
    throw apiError(`${config.provider} API error: ${resp.status} ${text}`, resp.status);
  }
  return readJsonAndRecord(resp, raw);
}

// runToolLoop 4 原语 provider 适配
const ollamaToolLoopProvider = {
  initState(messages) {
    return { messages: [...messages] };
  },

  async oneTurn(state, toolDefs, iter, config) {
    const data = await callWithTools(state.messages, toolDefs, config);
    if (!data) return { kind: 'fallback' };

    const message = data.choices?.[0]?.message;
    if (!message) return { kind: 'text', text: '' };

    if (!message.tool_calls?.length) {
      return { kind: 'text', text: withReasoning(message) };
    }

    const { toolCalls, assistantToolCalls } = normalizeOpenAIToolCalls(message.tool_calls, iter);

    // assistantBlock 保留 OpenAI 原生格式,直接回写到 messages 数组(id 已补齐、arguments 已统一成字符串)
    const assistantBlock = {
      role: 'assistant',
      content: message.content || null,
      tool_calls: assistantToolCalls,
    };

    return { kind: 'tools', toolCalls, assistantBlock, truncated: data.choices[0].finish_reason === 'length' };
  },

  appendToolTurn: appendOpenAIToolTurn,

  completeNoTools(state, config) {
    return complete(state.messages, config);
  },

  stateToMessages(state) {
    return state.messages;
  },
};

export async function completeWithTools(messages, toolDefs, toolHandlers, config) {
  return runToolLoop({
    provider: ollamaToolLoopProvider,
    messages,
    toolDefs,
    toolHandlers,
    config,
    completeResultMode: config.toolResultMode ?? 'text',
  });
}
