import crypto from 'node:crypto';
import db from '../index.js';

/**
 * 创建会话，title 默认 NULL
 */
export function createSession(characterId) {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(`
    INSERT INTO sessions (id, character_id, title, created_at, updated_at)
    VALUES (?, ?, NULL, ?, ?)
  `).run(id, characterId, now, now);
  return getSessionById(id);
}

/**
 * 根据 id 获取单个会话
 */
export function getSessionById(id) {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
}

/**
 * 获取某角色下的会话列表，按 updated_at 降序，支持分页
 */
export function getSessionsByCharacterId(characterId, limit = 20, offset = 0) {
  return db.prepare(
    'SELECT * FROM sessions WHERE character_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?',
  ).all(characterId, limit, offset);
}

/**
 * 更新会话标题
 */
export function updateSessionTitle(id, title) {
  db.prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?').run(title, Date.now(), id);
  return getSessionById(id);
}

/**
 * 更新会话的 updated_at（发送消息时调用）
 */
export function touchSession(id) {
  db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(Date.now(), id);
}

/**
 * 硬删除会话
 */
export function deleteSession(id) {
  return db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}
