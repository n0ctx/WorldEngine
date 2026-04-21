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

export function getWritingSessionCharacters(sessionId) {

  return db.prepare(
    `SELECT c.*, wsc.created_at AS activated_at
     FROM writing_session_characters wsc
     JOIN characters c ON c.id = wsc.character_id
     WHERE wsc.session_id = ?
     ORDER BY wsc.created_at ASC`
  ).all(sessionId);
}

export function addWritingSessionCharacter(sessionId, characterId) {

  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO writing_session_characters (id, session_id, character_id, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(id, sessionId, characterId, now);
}

export function removeWritingSessionCharacter(sessionId, characterId) {

  db.prepare(
    'DELETE FROM writing_session_characters WHERE session_id = ? AND character_id = ?'
  ).run(sessionId, characterId);
}
