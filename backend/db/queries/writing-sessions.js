import { randomUUID } from 'node:crypto';
import db from '../index.js';

/**
 * @param {string} worldId
 * @param {{ diary_date_mode?: string|null, persona_id?: string|null }} [opts]
 */
export function createWritingSession(worldId, { diary_date_mode = null, persona_id = null } = {}) {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (id, character_id, world_id, persona_id, mode, title, compressed_context, diary_date_mode, created_at, updated_at)
     VALUES (?, NULL, ?, ?, 'writing', NULL, NULL, ?, ?, ?)`
  ).run(id, worldId, persona_id, diary_date_mode, now, now);
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
}

/**
 * 列出某世界下的写作会话。
 * 传入 personaId 时仅返回该 persona 名下的会话；不传则返回该世界全部写作会话。
 */
export function getWritingSessionsByWorldId(worldId, personaId) {
  if (personaId) {
    return db.prepare(
      `SELECT * FROM sessions WHERE world_id = ? AND mode = 'writing' AND persona_id = ? ORDER BY updated_at DESC`
    ).all(worldId, personaId);
  }
  return db.prepare(
    `SELECT * FROM sessions WHERE world_id = ? AND mode = 'writing' ORDER BY updated_at DESC`
  ).all(worldId);
}

export function getWritingSessionById(id) {

  return db.prepare('SELECT * FROM sessions WHERE id = ? AND mode = \'writing\'').get(id);
}

export function deleteWritingSession(id) {

  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function updateWritingSessionTitle(id, title) {

  db.prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?').run(title, Date.now(), id);
}

export function touchWritingSession(id) {

  db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(Date.now(), id);
}

