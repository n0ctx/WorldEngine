import crypto from 'node:crypto';
import db from '../index.js';

/**
 * 写入或覆盖 nearby 角色的某个状态字段值。
 * 命中 (nearby_id, field_key) 唯一约束时更新现有行；否则插入新行。
 * @param {{ sessionId: string, nearbyId: string, fieldKey: string, valueJson: string|null }} data
 * @returns {string} 行 id
 */
export function upsertNearbyStateValue({ sessionId, nearbyId, fieldKey, valueJson }) {
  const now = Date.now();
  const existing = db.prepare(
    `SELECT id FROM session_nearby_character_state_values
     WHERE nearby_id = ? AND field_key = ?`,
  ).get(nearbyId, fieldKey);
  if (existing) {
    db.prepare(
      `UPDATE session_nearby_character_state_values
       SET runtime_value_json = ?, updated_at = ?
       WHERE id = ?`,
    ).run(valueJson, now, existing.id);
    return existing.id;
  }
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO session_nearby_character_state_values
      (id, session_id, nearby_id, field_key, runtime_value_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, sessionId, nearbyId, fieldKey, valueJson, now);
  return id;
}

export function getStateValuesByNearbyId(nearbyId) {
  return db.prepare(
    `SELECT * FROM session_nearby_character_state_values
     WHERE nearby_id = ?
     ORDER BY field_key`,
  ).all(nearbyId);
}

export function deleteStateValuesByNearbyId(nearbyId) {
  db.prepare(
    `DELETE FROM session_nearby_character_state_values WHERE nearby_id = ?`,
  ).run(nearbyId);
}
