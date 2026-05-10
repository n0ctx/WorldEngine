import { randomUUID } from 'node:crypto';
import db from '../index.js';

/**
 * @param {string} worldId
 * @param {{ diary_date_mode?: string|null }} [opts]
 */
export function createWritingSession(worldId, { diary_date_mode = null } = {}) {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (id, character_id, world_id, mode, title, compressed_context, diary_date_mode, created_at, updated_at)
     VALUES (?, NULL, ?, 'writing', NULL, NULL, ?, ?, ?)`
  ).run(id, worldId, diary_date_mode, now, now);
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
}

export function getWritingSessionsByWorldId(worldId) {

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

