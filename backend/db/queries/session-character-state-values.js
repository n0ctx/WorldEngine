import crypto from 'node:crypto';
import db from '../index.js';

/**
 * Upsert 会话级角色状态运行时值
 */
export function upsertSessionCharacterStateValue(sessionId, characterId, fieldKey, runtimeValueJson) {
  const now = Date.now();
  const existing = db.prepare(
    'SELECT id FROM session_character_state_values WHERE session_id = ? AND character_id = ? AND field_key = ?',
  ).get(sessionId, characterId, fieldKey);

  if (existing) {
    db.prepare(
      'UPDATE session_character_state_values SET runtime_value_json = ?, updated_at = ? WHERE id = ?',
    ).run(runtimeValueJson, now, existing.id);
  } else {
    db.prepare(`
      INSERT INTO session_character_state_values (id, session_id, character_id, field_key, runtime_value_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), sessionId, characterId, fieldKey, runtimeValueJson, now);
  }
}

/**
 * 获取某会话下某角色的所有运行时状态值，返回 { field_key → runtime_value_json } Map
 */
export function getSessionCharacterStateValues(sessionId, characterId) {
  const rows = db.prepare(
    'SELECT field_key, runtime_value_json FROM session_character_state_values WHERE session_id = ? AND character_id = ?',
  ).all(sessionId, characterId);
  return Object.fromEntries(rows.map((r) => [r.field_key, r.runtime_value_json]));
}

/**
 * 清空某会话的所有角色运行时状态（消息回滚时调用）
 */
export function clearSessionCharacterStateValues(sessionId) {
  db.prepare('DELETE FROM session_character_state_values WHERE session_id = ?').run(sessionId);
}
