import crypto from 'node:crypto';
import db from '../index.js';

/**
 * 创建会话，title 默认 NULL
 * @param {string} characterId
 * @param {{ diary_date_mode?: string|null }} [opts]
 */
export function createSession(characterId, { diary_date_mode = null } = {}) {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(`
    INSERT INTO sessions (id, character_id, title, diary_date_mode, created_at, updated_at)
    VALUES (?, ?, NULL, ?, ?, ?)
  `).run(id, characterId, diary_date_mode, now, now);
  return getSessionById(id);
}

/**
 * 根据 id 获取单个会话
 */
export function getSessionById(id) {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
}

/**
 * 取会话的首轮前状态基线快照（JSON 字符串或 null）。
 */
export function getSessionStateBaseline(id) {
  return db.prepare('SELECT state_baseline_json FROM sessions WHERE id = ?').get(id)?.state_baseline_json ?? null;
}

/**
 * 仅在基线尚未写入时落盘（不可变）。已有基线则原样保留，避免被后续轮次/重生成污染覆盖。
 * @returns {boolean} 本次是否实际写入
 */
export function setSessionStateBaselineIfAbsent(id, baselineJson) {
  const r = db.prepare(
    "UPDATE sessions SET state_baseline_json = ? WHERE id = ? AND state_baseline_json IS NULL",
  ).run(baselineJson, id);
  return r.changes > 0;
}

/**
 * 取某 persona 名下所有 writing 模式会话的 id 列表。
 */
export function getWritingSessionIdsByPersonaId(personaId) {
  return db.prepare(
    "SELECT id FROM sessions WHERE persona_id = ? AND mode = 'writing'",
  ).all(personaId);
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
 * 获取某世界最近更新的一条 chat 会话
 */
export function getLatestChatSessionByWorldId(worldId) {
  return db.prepare(`
    SELECT s.*
    FROM sessions s
    JOIN characters c ON c.id = s.character_id
    WHERE c.world_id = ? AND s.mode = 'chat'
    ORDER BY s.updated_at DESC
    LIMIT 1
  `).get(worldId);
}

/**
 * 获取某世界最近更新的一条会话（不限 mode，跨 chat/writing）
 * chat 会话通过 character_id → characters.world_id 关联世界；
 * writing 会话直接挂 sessions.world_id。
 */
export function getLatestSessionByWorldId(worldId) {
  return db.prepare(`
    SELECT s.*
    FROM sessions s
    LEFT JOIN characters c ON c.id = s.character_id
    WHERE c.world_id = ? OR s.world_id = ?
    ORDER BY s.updated_at DESC
    LIMIT 1
  `).get(worldId, worldId);
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
 * 清除 sessions.compressed_context（清空聊天记录时调用）
 * 注意：setCompressedContext 已删除（旧压缩系统废弃），此函数作为防御性清理保留，
 * 确保清空消息时同步置空旧数据库中可能残留的 compressed_context 字段值。
 */
export function clearCompressedContext(sessionId) {
  db.prepare('UPDATE sessions SET compressed_context = NULL, updated_at = ? WHERE id = ?')
    .run(Date.now(), sessionId);
}

/**
 * 硬删除会话
 */
export function deleteSession(id) {
  return db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}
