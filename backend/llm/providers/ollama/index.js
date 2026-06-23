/**
 * 本地 LLM Provider 适配 — Ollama / LM Studio
 *
 * 两者均使用 OpenAI-compatible /v1/chat/completions 接口
 */

import {
  OLLAMA_DEFAULT_BASE_URL,
  LMSTUDIO_DEFAULT_BASE_URL,
} from '../../../utils/constants.js';
import { runToolLoop } from '../../tool-loop-control.js';
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
    await emitProviderSignal(config, makeLocalErrorSignal(config, resp.status, body, 'request_error'));
    throw apiError(`${config.provider} API error: ${resp.status} ${body}`, resp.status);
  }

  for await (const data of parseSSE(resp.body)) {
    try {
      const parsed = JSON.parse(data);
      if (parsed.usage && config.usageRef) {
        const u = parsed.usage;
        if (u.prompt_tokens != null) config.usageRef.prompt_tokens = u.prompt_tokens;
        if (u.completion_tokens != null) config.usageRef.completion_tokens = u.completion_tokens;
      }
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
    await emitProviderSignal(config, makeLocalErrorSignal(config, resp.status, body, 'request_error'));
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
      return { kind: 'text', text: message.content || '' };
    }

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

    // assistantBlock 保留 OpenAI 原生格式,直接回写到 messages 数组
    const assistantBlock = {
      role: 'assistant',
      content: message.content || null,
      tool_calls: message.tool_calls,
    };

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
