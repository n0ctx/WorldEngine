import crypto from 'node:crypto';
import db from '../index.js';

/**
 * 创建临时角色（nearby character）
 * @param {{ sessionId: string, name: string, persona?: string, isSaved?: 0|1|boolean }} data
 * @returns {string} 新行 id
 */
export function createNearbyCharacter({ sessionId, name, persona = '', isSaved = 0 }) {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(`
    INSERT INTO session_nearby_characters (id, session_id, name, persona, is_saved, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, sessionId, name, persona, isSaved ? 1 : 0, now, now);
  return id;
}

export function getNearbyById(id) {
  return db.prepare(
    `SELECT * FROM session_nearby_characters WHERE id = ?`,
  ).get(id) ?? null;
}

export function getNearbyByName(sessionId, name) {
  return db.prepare(
    `SELECT * FROM session_nearby_characters WHERE session_id = ? AND name = ?`,
  ).get(sessionId, name) ?? null;
}

export function listNearbyBySessionId(sessionId) {
  return db.prepare(
    `SELECT * FROM session_nearby_characters
     WHERE session_id = ?
     ORDER BY is_saved DESC, created_at ASC`,
  ).all(sessionId);
}

export function updateNearbyName(id, name) {
  db.prepare(
    `UPDATE session_nearby_characters SET name = ?, updated_at = ? WHERE id = ?`,
  ).run(name, Date.now(), id);
}

export function updateNearbyPersona(id, persona) {
  db.prepare(
    `UPDATE session_nearby_characters SET persona = ?, updated_at = ? WHERE id = ?`,
  ).run(persona, Date.now(), id);
}

export function updateNearbyIsSaved(id, isSaved) {
  db.prepare(
    `UPDATE session_nearby_characters SET is_saved = ?, updated_at = ? WHERE id = ?`,
  ).run(isSaved ? 1 : 0, Date.now(), id);
}

export function deleteNearbyById(id) {
  db.prepare(`DELETE FROM session_nearby_characters WHERE id = ?`).run(id);
}

/**
 * 删除 sessionId 下所有 transient（is_saved=0）且 id 不在 keepIds 中的行。
 * keepIds 为空数组时也安全（不会保留任何 transient）。
 * is_saved=1 的行无论是否在 keepIds 中都会被保留。
 */
export function deleteTransientNotInIds(sessionId, keepIds) {
  const ids = Array.isArray(keepIds) ? keepIds : [];
  if (ids.length === 0) {
    db.prepare(
      `DELETE FROM session_nearby_characters
       WHERE session_id = ? AND is_saved = 0`,
    ).run(sessionId);
    return;
  }
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(
    `DELETE FROM session_nearby_characters
     WHERE session_id = ? AND is_saved = 0 AND id NOT IN (${placeholders})`,
  ).run(sessionId, ...ids);
}
