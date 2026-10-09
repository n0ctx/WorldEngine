/**
 * 本地 LLM Provider 适配 — Ollama / LM Studio / llama.cpp
 *
 * LM Studio、llama.cpp 走 OpenAI 兼容接口 /v1/chat/completions；Ollama 走原生接口 /api/chat（见 native.js）。
 * 两种接口共用这里的请求、流式输出、工具循环与错误处理，只在请求体与响应解析上分开。
 */

import {
  OLLAMA_DEFAULT_BASE_URL,
  LMSTUDIO_DEFAULT_BASE_URL,
  LLAMACPP_DEFAULT_BASE_URL,
} from '../../../utils/constants.js';
import { applyThinkingToOpenAICompatibleBody } from '../openai-compatible/thinking.js';
import { resolveSamplingFields } from '../_shared/sampling.js';
import { OLLAMA_NATIVE_PROTOCOL } from './native.js';
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

// /v1/chat/completions 请求体：llamacpp 的思考档位按 thinking.js 写入（按请求覆盖 server 默认值）；
// lmstudio 的兼容接口不认思考参数，走 default 分支不写任何字段。
function buildOpenAIChatBody({ messages, stream, tools }, config) {
  const body = {
    model: config.model,
    messages,
    temperature: config.temperature,
    max_tokens: config.max_tokens,
    ...resolveSamplingFields(config),
    stream,
  };
  if (tools) Object.assign(body, { tools, tool_choice: 'auto' });
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

// llama.cpp（--jinja）/ LM Studio 将推理内容放在 reasoning_content / reasoning 字段
async function* readOpenAIDeltas(resp) {
  for await (const data of parseSSE(resp.body)) {
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      continue;
    }
    const choice = parsed.choices?.[0];
    const delta = choice?.delta;
    yield {
      reasoning: delta?.reasoning_content || delta?.reasoning,
      content: delta?.content,
      finishReason: choice?.finish_reason,
      usage: parsed.usage,
    };
  }
}

function readOpenAIResult(data) {
  const choice = data.choices?.[0];
  const message = choice?.message && {
    content: choice.message.content,
    reasoning: choice.message.reasoning_content || choice.message.reasoning,
    tool_calls: choice.message.tool_calls,
  };
  return { message, finishReason: choice?.finish_reason };
}

const OPENAI_PROTOCOL = {
  path: '/v1/chat/completions',
  buildBody: buildOpenAIChatBody,
  readDeltas: readOpenAIDeltas,
  readResult: readOpenAIResult,
};

function protocolOf(config) {
  return config.provider === 'ollama' ? OLLAMA_NATIVE_PROTOCOL : OPENAI_PROTOCOL;
}

async function throwLocalHttpError(resp, config, raw) {
  const body = await resp.text().catch(() => '');
  raw?.error({ status: resp.status, text: body });
  await emitProviderSignal(config, makeLocalErrorSignal(config, resp.status, body, 'request_error'));
  throw apiError(`${config.provider} API error: ${resp.status} ${body}`, resp.status);
}

/** 拼请求体、落原始日志并发出请求；返回响应与原始日志记录器 */
async function postLocalChat(config, { messages, stream, tools }, callType) {
  const protocol = protocolOf(config);
  const body = protocol.buildBody({ messages, stream, tools }, config);
  const raw = logRawRequest(body, config, callType);
  const resp = await fetchAndRecord(`${getBaseUrl(config)}${protocol.path}`, {
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
  for await (const { reasoning, content, finishReason, usage } of protocolOf(config).readDeltas(resp)) {
    if (usage) {
      meta.usage = usage;
      if (config.usageRef) {
        if (usage.prompt_tokens != null) config.usageRef.prompt_tokens = usage.prompt_tokens;
        if (usage.completion_tokens != null) config.usageRef.completion_tokens = usage.completion_tokens;
      }
    }
    if (finishReason) meta.finishReason = finishReason;
    // 推理内容与 openai-compatible 同样包成 <think>
    if (reasoning) {
      if (!inThinking) { yield '<think>'; inThinking = true; }
      yield reasoning;
    }
    if (content) {
      if (inThinking) { yield '</think>\n'; inThinking = false; }
      yield content;
    }
  }
  if (inThinking) yield '</think>\n';
}

function withReasoning(message) {
  const reasoning = message?.reasoning;
  const content = message?.content || '';
  return reasoning ? `<think>${reasoning}</think>\n${content}` : content;
}

export async function complete(messages, config) {
  const { resp, raw } = await postLocalChat(config, { messages, stream: false }, config.callType || 'complete');
  if (!resp.ok) await throwLocalHttpError(resp, config, raw);

  const data = await readJsonAndRecord(resp, raw);
  return withReasoning(protocolOf(config).readResult(data).message);
}

// ============================================================
// Tool-use（工具定义与工具调用沿用 OpenAI 格式，Ollama 原生接口同构）
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
    tools: toolDefs,
  }, config.callType ? `${config.callType}:tools` : 'complete-tools');
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    raw?.error({ status: resp.status, text });
    if (isToolUnsupportedResponse(resp.status, text)) return null;
    throw apiError(`${config.provider} API error: ${resp.status} ${text}`, resp.status);
  }
  return protocolOf(config).readResult(await readJsonAndRecord(resp, raw));
}

// runToolLoop 4 原语 provider 适配
const ollamaToolLoopProvider = {
  initState(messages) {
    return { messages: [...messages] };
  },

  async oneTurn(state, toolDefs, iter, config) {
    const result = await callWithTools(state.messages, toolDefs, config);
    if (!result) return { kind: 'fallback' };

    const { message, finishReason } = result;
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

    return { kind: 'tools', toolCalls, assistantBlock, truncated: finishReason === 'length' };
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
