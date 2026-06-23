/**
 * Provider Safety Event 服务层。
 *
 * 职责：
 *   1) 持久化归一化 signal 到 provider_safety_events 表
 *   2) 写入 provider-safety logger（结构化 meta，便于 grep）
 *   3) 提供 toPublicSignal()：脱敏后用于 SSE/前端展示
 *   4) 列表与统计查询的包装（供 route 调用）
 *
 * 范围：不做内容审查、不做关键词匹配；上游 adapter 已经把 signal 归一化。
 */

import {
  insertProviderSafetyEvent,
  listProviderSafetyEvents,
  getProviderSafetyStats,
  getProviderSafetyEventById,
} from '../db/queries/provider-safety-events.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const log = createLogger('provider-safety', 'yellow');

/**
 * 写入一条 ProviderSafetySignal。返回入库后的事件行（已 parse 的 JSON 字段）。
 * 任何异常都会 catch，避免阻塞主对话流。
 */
export function recordProviderSafetyEvent(signal) {
  try {
    const saved = insertProviderSafetyEvent(signal);
    log.warn(`signal ${formatMeta({
      id: saved.id.slice(0, 8),
      provider: saved.provider,
      model: saved.model,
      adapter: saved.adapter,
      family: saved.signal_family,
      name: saved.signal_name,
      severity: saved.severity,
      action: saved.action,
      phase: saved.phase,
      stream: saved.stream,
      session: saved.session_id ? saved.session_id.slice(0, 8) : undefined,
      finish: saved.raw_finish_reason,
      native: saved.native_finish_reason,
      stopReason: saved.stop_reason,
      errCode: saved.provider_error_code,
      mode: saved.mode,
    })}`);
    return saved;
  } catch (err) {
    log.error(`signal.persist_failed ${formatMeta({ msg: err?.message, provider: signal?.provider, name: signal?.signalName })}`);
    return null;
  }
}

/**
 * 脱敏后用于前端展示。不返回 hash / 内部请求 id / 原文。
 */
export function toPublicProviderSafetySignal(event) {
  if (!event) return null;
  return {
    id: event.id,
    createdAt: event.created_at,
    provider: event.provider,
    model: event.model,
    adapter: event.adapter,
    mode: event.mode,
    stream: !!event.stream,
    phase: event.phase,
    signalFamily: event.signal_family,
    signalName: event.signal_name,
    severity: event.severity,
    action: event.action,
    rawFinishReason: event.raw_finish_reason,
    nativeFinishReason: event.native_finish_reason,
    stopReason: event.stop_reason,
    stopDetails: event.stop_details_json,
    contentFilter: event.content_filter_json,
    geminiPromptFeedback: event.gemini_prompt_feedback_json,
    geminiSafetyRatings: event.gemini_safety_ratings_json,
    minimaxSensitiveMeta: event.minimax_sensitive_meta_json,
    providerErrorCode: event.provider_error_code,
    providerErrorType: event.provider_error_type,
    chunkIndex: event.chunk_index,
    emittedCharsBeforeTrigger: event.emitted_chars_before_trigger,
  };
}

export { listProviderSafetyEvents, getProviderSafetyStats, getProviderSafetyEventById };
