/**
 * Provider Safety Signal 提取与归一化。
 *
 * 范围：只从 Provider 已经返回的字段提取"安全/拒绝/敏感/过滤/截断"信号。
 *      不做自研审核、关键词匹配、内容分类、moderation API 调用。
 *
 * 输出统一结构 ProviderSafetySignal（见 backend/db/queries/provider-safety-events.js）。
 * 调用方拿到 signal 后，自行决定写库 / 发 SSE / 日志。
 */

import crypto from 'node:crypto';

const SAFETY_KEYWORDS = /(policy|safety|filter|content[_-]?policy|sensitive|moderation|refusal|prohibited)/i;

const SEVERITY_BY_CONTENT_FILTER_LEVEL = { 0: 'critical', 1: 'high', 2: 'medium', 3: 'low' };

const OPENAI_COMPAT_ADAPTER = 'openai-compatible';

export function hashText(text) {
  if (text == null) return null;
  const s = typeof text === 'string' ? text : JSON.stringify(text);
  return crypto.createHash('sha256').update(s).digest('hex');
}

function detectAdapter(provider) {
  if (provider === 'anthropic' || provider === 'kimi-coding' || provider === 'minimax-coding') return 'anthropic';
  if (provider === 'gemini') return 'gemini';
  if (provider === 'ollama' || provider === 'lmstudio') return provider;
  if (provider === 'mock') return 'mock';
  return OPENAI_COMPAT_ADAPTER;
}

function baseSignal(context, overrides = {}) {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    tenantId: context.tenantId,
    sessionId: context.sessionId,
    conversationId: context.conversationId,
    messageId: context.messageId,
    internalRequestId: context.internalRequestId || crypto.randomUUID(),
    providerRequestId: context.providerRequestId,
    mode: context.mode || 'unknown',
    provider: context.provider || 'unknown',
    model: context.model,
    adapter: context.adapter || detectAdapter(context.provider),
    stream: !!context.stream,
    phase: context.phase || 'unknown',
    signalFamily: 'unknown',
    signalName: 'unknown',
    severity: 'unknown',
    action: 'observed_only',
    ...overrides,
  };
}

// ============================================================
// OpenAI-compatible
// ============================================================

/**
 * 从 OpenAI-compatible 响应 payload（流式 chunk 或非流式完整 JSON）提取 signal。
 * 返回 ProviderSafetySignal 或 null。
 *
 * payload 形态：
 *   - 非流式：完整 { choices, error, contentFilter, input_sensitive, ... }
 *   - 流式 chunk：parsed SSE chunk { choices: [{ delta, finish_reason, native_finish_reason }] }
 *   - HTTP error body：{ error: { code, message, ... }, contentFilter, ... }
 *
 * context 必填：provider, phase, stream, mode...
 */
export function extractOpenAICompatibleSignal(payload, context) {
  if (!payload || typeof payload !== 'object') return null;
  const choice = payload.choices?.[0];
  const delta = choice?.delta;
  const message = choice?.message;
  const finishReason = choice?.finish_reason || null;
  const nativeFinishReason = choice?.native_finish_reason || null;
  const refusal = delta?.refusal ?? message?.refusal ?? null;
  const contentFilter = payload.contentFilter ?? payload.content_filter ?? null;
  const inputSensitive = payload.input_sensitive === true;
  const outputSensitive = payload.output_sensitive === true;
  const baseResp = payload.base_resp || payload.baseResp || null;
  const error = payload.error || null;

  // --- 智谱 1301 ---
  const errCode = error?.code != null ? String(error.code) : null;
  if (errCode === '1301') {
    return baseSignal(context, {
      signalFamily: 'safety',
      signalName: 'zhipu_1301',
      severity: 'high',
      action: 'request_blocked_by_provider',
      providerErrorCode: errCode,
      providerErrorType: error?.type,
      providerErrorMessageHash: hashText(error?.message),
      contentFilter: contentFilter || undefined,
      rawFinishReason: finishReason || undefined,
    });
  }

  // --- finish_reason ---
  if (finishReason === 'content_filter') {
    return baseSignal(context, {
      signalFamily: 'safety',
      signalName: 'content_filter',
      severity: 'high',
      action: context.stream ? 'stream_stopped_by_provider' : 'response_omitted_by_provider',
      rawFinishReason: finishReason,
      nativeFinishReason: nativeFinishReason || undefined,
      contentFilter: contentFilter || undefined,
    });
  }
  if (finishReason === 'sensitive') {
    const level = Array.isArray(contentFilter) ? contentFilter[0]?.level : undefined;
    return baseSignal(context, {
      signalFamily: 'safety',
      signalName: 'finish_reason_sensitive',
      severity: SEVERITY_BY_CONTENT_FILTER_LEVEL[level] || 'high',
      action: context.stream ? 'stream_stopped_by_provider' : 'response_omitted_by_provider',
      rawFinishReason: finishReason,
      contentFilter: contentFilter || undefined,
    });
  }

  // --- OpenRouter native_finish_reason 含 safety/filter/content ---
  if (nativeFinishReason && SAFETY_KEYWORDS.test(nativeFinishReason)) {
    return baseSignal(context, {
      signalFamily: 'safety',
      signalName: `openrouter_native_${nativeFinishReason}`.toLowerCase(),
      severity: 'high',
      action: context.stream ? 'stream_stopped_by_provider' : 'response_omitted_by_provider',
      rawFinishReason: finishReason || undefined,
      nativeFinishReason,
    });
  }

  // --- refusal ---
  if (refusal != null && String(refusal).length > 0) {
    return baseSignal(context, {
      signalFamily: 'refusal',
      signalName: 'message_refusal',
      severity: 'medium',
      action: 'response_omitted_by_provider',
      rawFinishReason: finishReason || undefined,
      providerErrorMessageHash: hashText(String(refusal)),
    });
  }

  // --- MiniMax sensitive flags ---
  if (inputSensitive || outputSensitive) {
    const isInput = inputSensitive;
    return baseSignal(context, {
      signalFamily: 'safety',
      signalName: isInput ? 'minimax_input_sensitive' : 'minimax_output_sensitive',
      severity: 'high',
      action: isInput ? 'request_blocked_by_provider' : 'response_omitted_by_provider',
      minimaxSensitiveMeta: {
        input_sensitive: payload.input_sensitive ?? null,
        output_sensitive: payload.output_sensitive ?? null,
        input_sensitive_type: payload.input_sensitive_type ?? null,
        output_sensitive_type: payload.output_sensitive_type ?? null,
        output_sensitive_int: payload.output_sensitive_int ?? null,
      },
    });
  }

  // --- contentFilter 单独出现（无 finish_reason 触发）---
  if (Array.isArray(contentFilter) && contentFilter.length > 0) {
    const entry = contentFilter[0];
    const role = entry?.role || 'assistant';
    const level = entry?.level;
    return baseSignal(context, {
      signalFamily: 'safety',
      signalName: role === 'user' ? 'input_filter' : 'output_filter',
      severity: SEVERITY_BY_CONTENT_FILTER_LEVEL[level] || 'medium',
      action: role === 'user' ? 'request_blocked_by_provider' : 'response_omitted_by_provider',
      contentFilter,
    });
  }

  // --- base_resp 非 0 ---
  if (baseResp && baseResp.status_code != null && baseResp.status_code !== 0) {
    return baseSignal(context, {
      signalFamily: 'provider_error',
      signalName: 'minimax_base_resp_error',
      severity: 'medium',
      action: 'request_blocked_by_provider',
      providerErrorCode: String(baseResp.status_code),
      providerErrorMessageHash: hashText(baseResp.status_msg),
    });
  }

  // --- error 中含安全关键字 ---
  if (error && (SAFETY_KEYWORDS.test(error.message || '') || SAFETY_KEYWORDS.test(error.type || '') || SAFETY_KEYWORDS.test(error.code || ''))) {
    return baseSignal(context, {
      signalFamily: 'provider_error',
      signalName: 'openai_safety_error',
      severity: 'high',
      action: 'request_blocked_by_provider',
      providerErrorCode: errCode || undefined,
      providerErrorType: error.type,
      providerErrorMessageHash: hashText(error.message),
    });
  }

  return null;
}

// ============================================================
// Anthropic
// ============================================================

/**
 * 从 Anthropic 响应（非流式完整 JSON 或流式 event payload）提取 signal。
 * 流式：传 message_delta.delta（包含 stop_reason），或 message_start.message。
 * 非流式：传 完整 response。
 */
export function extractAnthropicSignal(payload, context) {
  if (!payload || typeof payload !== 'object') return null;

  const stopReason = payload.stop_reason || payload.delta?.stop_reason || null;
  const stopDetails = payload.stop_details || payload.delta?.stop_details || null;
  const error = payload.error || null;

  if (stopReason === 'refusal') {
    return baseSignal(context, {
      signalFamily: 'refusal',
      signalName: 'anthropic_refusal',
      severity: 'high',
      action: context.stream ? 'stream_stopped_by_provider' : 'response_omitted_by_provider',
      stopReason,
      stopDetails: stopDetails || undefined,
    });
  }
  if (stopReason === 'pause_turn') {
    return baseSignal(context, {
      signalFamily: 'operational',
      signalName: 'anthropic_pause_turn',
      severity: 'info',
      action: 'normal_stop_with_signal',
      stopReason,
    });
  }
  if (stopReason === 'max_tokens') {
    return baseSignal(context, {
      signalFamily: 'operational',
      signalName: 'anthropic_max_tokens',
      severity: 'info',
      action: 'normal_stop_with_signal',
      stopReason,
    });
  }
  if (stopReason === 'model_context_window_exceeded') {
    return baseSignal(context, {
      signalFamily: 'operational',
      signalName: 'anthropic_context_window',
      severity: 'medium',
      action: 'request_blocked_by_provider',
      stopReason,
    });
  }

  if (error && SAFETY_KEYWORDS.test(`${error.type || ''} ${error.message || ''}`)) {
    return baseSignal(context, {
      signalFamily: 'provider_error',
      signalName: 'anthropic_safety_error',
      severity: 'high',
      action: 'request_blocked_by_provider',
      providerErrorType: error.type,
      providerErrorMessageHash: hashText(error.message),
    });
  }

  return null;
}

// ============================================================
// Gemini
// ============================================================

export function extractGeminiSignal(payload, context) {
  if (!payload || typeof payload !== 'object') return null;
  const promptFeedback = payload.promptFeedback || null;
  const candidate = payload.candidates?.[0];
  const finishReason = candidate?.finishReason || null;
  const safetyRatings = candidate?.safetyRatings || null;

  if (promptFeedback?.blockReason) {
    return baseSignal(context, {
      signalFamily: 'safety',
      signalName: 'gemini_prompt_blocked',
      severity: 'high',
      action: 'request_blocked_by_provider',
      geminiPromptFeedback: promptFeedback,
    });
  }

  if (finishReason === 'SAFETY') {
    return baseSignal(context, {
      signalFamily: 'safety',
      signalName: 'gemini_safety_finish',
      severity: 'high',
      action: context.stream ? 'stream_stopped_by_provider' : 'response_omitted_by_provider',
      rawFinishReason: finishReason,
      geminiSafetyRatings: safetyRatings || undefined,
    });
  }
  if (finishReason === 'PROHIBITED_CONTENT') {
    return baseSignal(context, {
      signalFamily: 'safety',
      signalName: 'gemini_prohibited_content',
      severity: 'critical',
      action: context.stream ? 'stream_stopped_by_provider' : 'response_omitted_by_provider',
      rawFinishReason: finishReason,
      geminiSafetyRatings: safetyRatings || undefined,
    });
  }
  if (finishReason === 'SPII') {
    return baseSignal(context, {
      signalFamily: 'safety',
      signalName: 'gemini_spii',
      severity: 'high',
      action: context.stream ? 'stream_stopped_by_provider' : 'response_omitted_by_provider',
      rawFinishReason: finishReason,
    });
  }
  if (finishReason === 'RECITATION') {
    return baseSignal(context, {
      signalFamily: 'policy',
      signalName: 'gemini_recitation',
      severity: 'medium',
      action: context.stream ? 'stream_stopped_by_provider' : 'response_omitted_by_provider',
      rawFinishReason: finishReason,
    });
  }
  if (Array.isArray(safetyRatings) && safetyRatings.some((r) => r?.blocked === true)) {
    return baseSignal(context, {
      signalFamily: 'safety',
      signalName: 'gemini_category_blocked',
      severity: 'high',
      action: context.stream ? 'stream_stopped_by_provider' : 'response_omitted_by_provider',
      rawFinishReason: finishReason || undefined,
      geminiSafetyRatings: safetyRatings,
    });
  }
  return null;
}

// ============================================================
// HTTP error body → signal（任意 adapter 复用）
// ============================================================

export function extractProviderErrorSignal(errorBody, context) {
  if (errorBody == null) return null;
  let parsed = errorBody;
  if (typeof errorBody === 'string') {
    try { parsed = JSON.parse(errorBody); } catch { parsed = { error: { message: errorBody } }; }
  }
  // 先按 OpenAI-compatible 处理（覆盖 1301 / contentFilter / sensitive / error）
  const openaiSignal = extractOpenAICompatibleSignal(parsed, { ...context, phase: 'request_error' });
  if (openaiSignal) return openaiSignal;
  // 兜底：识别 Anthropic 风格 error
  if (parsed?.type === 'error' && parsed.error) {
    return extractAnthropicSignal(parsed, { ...context, phase: 'request_error' });
  }
  // Gemini 错误
  if (parsed?.promptFeedback) {
    return extractGeminiSignal(parsed, { ...context, phase: 'request_error' });
  }
  return null;
}

// ============================================================
// 工具：合并 context、emit helper
// ============================================================

/**
 * 安全调用 onProviderSignal callback；callback 抛错不影响主流程。
 */
export async function emitProviderSignal(config, signal) {
  if (!signal) return;
  const cb = config?.onProviderSignal;
  if (typeof cb !== 'function') return;
  try { await cb(signal); } catch { /* swallow */ }
}

/**
 * 从 LLMConfig 构造 context（供 adapter 在调用 extract* 前组装）。
 */
export function buildContextFromConfig(config, overrides = {}) {
  const ctx = config?.llmCallContext || {};
  return {
    provider: config?.provider,
    model: config?.model,
    adapter: detectAdapter(config?.provider),
    mode: ctx.mode || 'unknown',
    sessionId: ctx.sessionId,
    messageId: ctx.messageId,
    conversationId: config?.conversationId,
    internalRequestId: ctx.internalRequestId,
    stream: !!ctx.stream,
    tenantId: ctx.tenantId,
    ...overrides,
  };
}
