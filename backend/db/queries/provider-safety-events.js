/**
 * provider_safety_events 表查询。
 * 表结构见 backend/db/schema.js。
 *
 * 范围：Provider 已返回的安全/拒绝/敏感/过滤/截断信号的归一化记录。
 * 不存原文，只存 hash 和已脱敏的 provider meta。
 */

import crypto from 'node:crypto';
import db from '../index.js';

const ALL_COLUMNS = [
  'id', 'created_at', 'tenant_id', 'session_id', 'conversation_id', 'message_id',
  'internal_request_id', 'provider_request_id', 'mode', 'provider', 'model',
  'adapter', 'stream', 'phase', 'signal_family', 'signal_name', 'severity',
  'action', 'raw_finish_reason', 'native_finish_reason', 'stop_reason',
  'stop_details_json', 'content_filter_json', 'gemini_prompt_feedback_json',
  'gemini_safety_ratings_json', 'minimax_sensitive_meta_json',
  'provider_error_code', 'provider_error_type', 'provider_error_message_hash',
  'emitted_chars_before_trigger', 'chunk_index', 'prompt_hash', 'output_hash',
  'raw_provider_meta_redacted_json',
];

const JSON_COLUMNS = new Set([
  'stop_details_json', 'content_filter_json', 'gemini_prompt_feedback_json',
  'gemini_safety_ratings_json', 'minimax_sensitive_meta_json',
  'raw_provider_meta_redacted_json',
]);

function rowToEvent(row) {
  if (!row) return null;
  const out = { ...row };
  for (const col of JSON_COLUMNS) {
    if (out[col] != null) {
      try { out[col] = JSON.parse(out[col]); } catch { /* keep raw */ }
    }
  }
  out.stream = !!row.stream;
  return out;
}

function toStorable(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

export function insertProviderSafetyEvent(event) {
  const id = event.id || crypto.randomUUID();
  const createdAt = event.created_at || event.createdAt || new Date().toISOString();
  const row = {
    id,
    created_at: createdAt,
    tenant_id: event.tenantId ?? null,
    session_id: event.sessionId ?? null,
    conversation_id: event.conversationId ?? null,
    message_id: event.messageId ?? null,
    internal_request_id: event.internalRequestId ?? id,
    provider_request_id: event.providerRequestId ?? null,
    mode: event.mode ?? 'unknown',
    provider: event.provider ?? 'unknown',
    model: event.model ?? null,
    adapter: event.adapter ?? 'unknown',
    stream: event.stream ? 1 : 0,
    phase: event.phase ?? 'unknown',
    signal_family: event.signalFamily ?? 'unknown',
    signal_name: event.signalName ?? 'unknown',
    severity: event.severity ?? 'unknown',
    action: event.action ?? 'observed_only',
    raw_finish_reason: event.rawFinishReason ?? null,
    native_finish_reason: event.nativeFinishReason ?? null,
    stop_reason: event.stopReason ?? null,
    stop_details_json: toStorable(event.stopDetails),
    content_filter_json: toStorable(event.contentFilter),
    gemini_prompt_feedback_json: toStorable(event.geminiPromptFeedback),
    gemini_safety_ratings_json: toStorable(event.geminiSafetyRatings),
    minimax_sensitive_meta_json: toStorable(event.minimaxSensitiveMeta),
    provider_error_code: event.providerErrorCode != null ? String(event.providerErrorCode) : null,
    provider_error_type: event.providerErrorType ?? null,
    provider_error_message_hash: event.providerErrorMessageHash ?? null,
    emitted_chars_before_trigger: event.emittedCharsBeforeTrigger ?? null,
    chunk_index: event.chunkIndex ?? null,
    prompt_hash: event.promptHash ?? null,
    output_hash: event.outputHash ?? null,
    raw_provider_meta_redacted_json: toStorable(event.rawProviderMetaRedacted),
  };

  const placeholders = ALL_COLUMNS.map(() => '?').join(', ');
  db.prepare(
    `INSERT INTO provider_safety_events (${ALL_COLUMNS.join(', ')}) VALUES (${placeholders})`
  ).run(...ALL_COLUMNS.map((c) => row[c]));

  return rowToEvent(row);
}

export function getProviderSafetyEventById(id) {
  const row = db.prepare('SELECT * FROM provider_safety_events WHERE id = ?').get(id);
  return rowToEvent(row);
}

const FILTERABLE = {
  provider: 'provider',
  model: 'model',
  sessionId: 'session_id',
  signalFamily: 'signal_family',
  signalName: 'signal_name',
  severity: 'severity',
  mode: 'mode',
};

export function listProviderSafetyEvents(filters = {}) {
  const where = [];
  const params = [];
  for (const [key, col] of Object.entries(FILTERABLE)) {
    if (filters[key]) { where.push(`${col} = ?`); params.push(String(filters[key])); }
  }
  if (filters.since) { where.push('created_at >= ?'); params.push(String(filters.since)); }
  if (filters.until) { where.push('created_at <= ?'); params.push(String(filters.until)); }
  if (filters.cursor) { where.push('created_at < ?'); params.push(String(filters.cursor)); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 500);
  const sql = `SELECT * FROM provider_safety_events ${whereSql} ORDER BY created_at DESC LIMIT ?`;
  const rows = db.prepare(sql).all(...params, limit);
  return rows.map(rowToEvent);
}

export function getProviderSafetyStats(filters = {}) {
  const where = [];
  const params = [];
  for (const [key, col] of Object.entries(FILTERABLE)) {
    if (filters[key]) { where.push(`${col} = ?`); params.push(String(filters[key])); }
  }
  if (filters.since) { where.push('created_at >= ?'); params.push(String(filters.since)); }
  if (filters.until) { where.push('created_at <= ?'); params.push(String(filters.until)); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) AS c FROM provider_safety_events ${whereSql}`).get(...params).c;
  const byProvider = Object.fromEntries(
    db.prepare(`SELECT provider, COUNT(*) AS c FROM provider_safety_events ${whereSql} GROUP BY provider`).all(...params).map((r) => [r.provider, r.c])
  );
  const bySignal = Object.fromEntries(
    db.prepare(`SELECT signal_name, COUNT(*) AS c FROM provider_safety_events ${whereSql} GROUP BY signal_name`).all(...params).map((r) => [r.signal_name, r.c])
  );
  const bySeverity = Object.fromEntries(
    db.prepare(`SELECT severity, COUNT(*) AS c FROM provider_safety_events ${whereSql} GROUP BY severity`).all(...params).map((r) => [r.severity, r.c])
  );
  return { total, byProvider, bySignal, bySeverity };
}
