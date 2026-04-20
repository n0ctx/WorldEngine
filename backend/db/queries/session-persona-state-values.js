import crypto from 'node:crypto';
import db from '../index.js';

/**
 * Upsert 会话级玩家状态运行时值
 */
export function upsertSessionPersonaStateValue(sessionId, worldId, fieldKey, runtimeValueJson) {
  const now = Date.now();
  const existing = db.prepare(
    'SELECT id FROM session_persona_state_values WHERE session_id = ? AND world_id = ? AND field_key = ?',
  ).get(sessionId, worldId, fieldKey);

  if (existing) {
    db.prepare(
      'UPDATE session_persona_state_values SET runtime_value_json = ?, updated_at = ? WHERE id = ?',
    ).run(runtimeValueJson, now, existing.id);
  } else {
    db.prepare(`
      INSERT INTO session_persona_state_values (id, session_id, world_id, field_key, runtime_value_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), sessionId, worldId, fieldKey, runtimeValueJson, now);
  }
}

/**
 * 获取某会话下某世界的所有玩家运行时状态值，返回 { field_key → runtime_value_json } Map
 */
export function getSessionPersonaStateValues(sessionId, worldId) {
  const rows = db.prepare(
    'SELECT field_key, runtime_value_json FROM session_persona_state_values WHERE session_id = ? AND world_id = ?',
  ).all(sessionId, worldId);
  return Object.fromEntries(rows.map((r) => [r.field_key, r.runtime_value_json]));
}

/**
 * 清空某会话的所有玩家运行时状态（消息回滚时调用）
 */
export function clearSessionPersonaStateValues(sessionId) {
  db.prepare('DELETE FROM session_persona_state_values WHERE session_id = ?').run(sessionId);
}
