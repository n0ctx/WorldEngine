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

/**
 * 一次取出多个 nearby 角色的状态值，返回 Map<nearby_id, 行数组>；每组内按 field_key 排序，
 * 没有任何值的 nearby 也会得到空数组。
 * @param {string[]} nearbyIds
 */
export function getStateValuesByNearbyIds(nearbyIds) {
  const grouped = new Map(nearbyIds.map((id) => [id, []]));
  if (nearbyIds.length === 0) return grouped;
  const placeholders = nearbyIds.map(() => '?').join(', ');
  const rows = db.prepare(
    `SELECT * FROM session_nearby_character_state_values
     WHERE nearby_id IN (${placeholders})
     ORDER BY nearby_id, field_key`,
  ).all(...nearbyIds);
  for (const row of rows) grouped.get(row.nearby_id).push(row);
  return grouped;
}

export function deleteStateValuesByNearbyId(nearbyId) {
  db.prepare(
    `DELETE FROM session_nearby_character_state_values WHERE nearby_id = ?`,
  ).run(nearbyId);
}
