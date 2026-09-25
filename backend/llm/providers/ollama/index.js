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
import { appendOpenAIToolTurn, parseOpenAIToolCalls } from '../_shared/converters.js';
import { emitProviderSignal, buildContextFromConfig, hashText } from '../_shared/provider-safety-signals.js';
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
// llamacpp 的 effort_* → reasoning_effort（按请求覆盖 server 默认值）；
// ollama / lmstudio 在 thinking.js 走 default 分支，不写任何字段，行为不变。
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

async function throwLocalHttpError(resp, config) {
  const body = await resp.text().catch(() => '');
  await emitProviderSignal(config, makeLocalErrorSignal(config, resp.status, body, 'request_error'));
  throw apiError(`${config.provider} API error: ${resp.status} ${body}`, resp.status);
}

export async function* streamChat(messages, config) {
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/v1/chat/completions`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildLocalChatBody({ messages, stream: true }, config)),
    signal: config.signal,
  });

  if (!resp.ok) await throwLocalHttpError(resp, config);

  let inThinking = false;
  for await (const data of parseSSE(resp.body)) {
    try {
      const parsed = JSON.parse(data);
      if (parsed.usage && config.usageRef) {
        const u = parsed.usage;
        if (u.prompt_tokens != null) config.usageRef.prompt_tokens = u.prompt_tokens;
        if (u.completion_tokens != null) config.usageRef.completion_tokens = u.completion_tokens;
      }
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
  const baseUrl = getBaseUrl(config);
  const url = `${baseUrl}/v1/chat/completions`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildLocalChatBody({ messages, stream: false }, config)),
    signal: config.signal,
  });

  if (!resp.ok) await throwLocalHttpError(resp, config);

  const data = await resp.json();
  return withReasoning(data.choices?.[0]?.message);
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
    body: JSON.stringify(buildLocalChatBody({
      messages,
      stream: false,
      extra: { tools: toolDefs, tool_choice: 'auto' },
    }, config)),
    signal: config.signal,
  });
  if (!resp.ok) return null; // 降级信号(4xx/5xx 一视同仁,与历史行为对齐)
  return resp.json();
}

// runToolLoop 4 原语 provider 适配
const ollamaToolLoopProvider = {
  initState(messages) {
    return { messages: [...messages] };
  },

  async oneTurn(state, toolDefs, _iter, config) {
    const data = await callWithTools(state.messages, toolDefs, config).catch(() => null);
    if (!data) return { kind: 'fallback' };

    const message = data.choices?.[0]?.message;
    if (!message) return { kind: 'text', text: '' };

    if (!message.tool_calls?.length) {
      return { kind: 'text', text: withReasoning(message) };
    }

    const toolCalls = parseOpenAIToolCalls(message.tool_calls);

    // assistantBlock 保留 OpenAI 原生格式,直接回写到 messages 数组
    const assistantBlock = {
      role: 'assistant',
      content: message.content || null,
      tool_calls: message.tool_calls,
    };

    return { kind: 'tools', toolCalls, assistantBlock };
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
