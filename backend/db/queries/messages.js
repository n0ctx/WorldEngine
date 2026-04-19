import crypto from 'node:crypto';
import db from '../index.js';

/**
 * 创建消息
 * @param {object} data - { session_id, role, content, attachments?, created_at? }
 */
export function createMessage(data) {
  const id = crypto.randomUUID();
  const now = data.created_at ?? Date.now();
  const attachments = data.attachments ? JSON.stringify(data.attachments) : null;

  db.prepare(`
    INSERT INTO messages (id, session_id, role, content, attachments, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.session_id, data.role, data.content, attachments, now);

  return getMessageById(id);
}

/**
 * 根据 id 获取单条消息，attachments 自动 JSON.parse
 */
export function getMessageById(id) {
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  if (row) {
    row.attachments = row.attachments ? JSON.parse(row.attachments) : null;
  }
  return row;
}

/**
 * 获取某会话下的消息，按 created_at 升序，支持分页，attachments 自动 JSON.parse
 */
export function getMessagesBySessionId(sessionId, limit = 50, offset = 0) {
  const rows = db.prepare(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?',
  ).all(sessionId, limit, offset);

  for (const row of rows) {
    row.attachments = row.attachments ? JSON.parse(row.attachments) : null;
  }
  return rows;
}

/**
 * 更新单条消息的 attachments 字段
 */
export function updateMessageAttachments(id, paths) {
  db.prepare('UPDATE messages SET attachments = ? WHERE id = ?')
    .run(JSON.stringify(paths), id);
}

/**
 * 更新单条消息的 content
 */
export function updateMessageContent(id, content) {
  db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, id);
  return getMessageById(id);
}

/**
 * 删除指定消息之后的所有消息（不含该消息本身），基于 created_at 排序
 */
export function deleteMessagesAfter(messageId) {
  const msg = db.prepare('SELECT session_id, created_at FROM messages WHERE id = ?').get(messageId);
  if (!msg) return { changes: 0 };

  return db.prepare(
    'DELETE FROM messages WHERE session_id = ? AND created_at > ?',
  ).run(msg.session_id, msg.created_at);
}

/**
 * 硬删除单条消息
 */
export function deleteMessage(id) {
  return db.prepare('DELETE FROM messages WHERE id = ?').run(id);
}

/**
 * 删除某会话下的所有消息
 */
export function deleteAllMessagesBySessionId(sessionId) {
  return db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
}

// ─── 副作用清理辅助查询（只读） ──────────────────────────────────

/**
 * 解析单行 attachments JSON，返回 string[] 或 []
 */
function parseAttachments(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v) => typeof v === 'string');
  } catch {
    return [];
  }
}

/**
 * 获取单条消息的附件路径列表
 * @param {string} messageId
 * @returns {string[]}
 */
export function getAttachmentsByMessageId(messageId) {
  const row = db.prepare('SELECT attachments FROM messages WHERE id = ? AND attachments IS NOT NULL').get(messageId);
  return parseAttachments(row?.attachments);
}

/**
 * 批量获取多条消息的附件路径列表
 * @param {string[]} messageIds
 * @returns {string[]}
 */
export function getAttachmentsByMessageIds(messageIds) {
  if (!messageIds || messageIds.length === 0) return [];
  const result = [];
  for (const id of messageIds) {
    result.push(...getAttachmentsByMessageId(id));
  }
  return result;
}

/**
 * 获取某会话下所有消息的附件路径列表
 * @param {string} sessionId
 * @returns {string[]}
 */
export function getAttachmentsBySessionId(sessionId) {
  const rows = db.prepare(
    'SELECT attachments FROM messages WHERE session_id = ? AND attachments IS NOT NULL',
  ).all(sessionId);
  return rows.flatMap((r) => parseAttachments(r.attachments));
}

/**
 * 获取某角色下所有消息的附件路径列表（JOIN sessions）
 * @param {string} characterId
 * @returns {string[]}
 */
export function getAttachmentsByCharacterId(characterId) {
  const rows = db.prepare(`
    SELECT m.attachments
    FROM messages m
    JOIN sessions s ON m.session_id = s.id
    WHERE s.character_id = ? AND m.attachments IS NOT NULL
  `).all(characterId);
  return rows.flatMap((r) => parseAttachments(r.attachments));
}

/**
 * 获取某世界下所有消息的附件路径列表（JOIN sessions + characters）
 * @param {string} worldId
 * @returns {string[]}
 */
export function getAttachmentsByWorldId(worldId) {
  const rows = db.prepare(`
    SELECT m.attachments
    FROM messages m
    JOIN sessions s ON m.session_id = s.id
    JOIN characters c ON s.character_id = c.id
    WHERE c.world_id = ? AND m.attachments IS NOT NULL
  `).all(worldId);
  return rows.flatMap((r) => parseAttachments(r.attachments));
}

/**
 * 获取某会话下所有消息 id
 * @param {string} sessionId
 * @returns {string[]}
 */
export function getMessageIdsBySessionId(sessionId) {
  return db.prepare('SELECT id FROM messages WHERE session_id = ?')
    .all(sessionId)
    .map((r) => r.id);
}

/**
 * 只返回 is_compressed=0 的消息，按 created_at ASC（用于 context 组装）
 */
export function getUncompressedMessagesBySessionId(sessionId) {
  const rows = db.prepare(
    'SELECT * FROM messages WHERE session_id = ? AND is_compressed = 0 ORDER BY created_at ASC',
  ).all(sessionId);
  for (const row of rows) {
    row.attachments = row.attachments ? JSON.parse(row.attachments) : null;
  }
  return rows;
}

/**
 * 统计 is_compressed=0 且 role='user' 的消息数（即未压缩轮次数）
 */
export function countUncompressedRounds(sessionId) {
  return db.prepare(
    "SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND is_compressed = 0 AND role = 'user'",
  ).get(sessionId).n;
}

/**
 * 将该 session 所有 is_compressed=0 的消息批量标记为 1
 */
export function markAllMessagesCompressed(sessionId) {
  db.prepare(
    'UPDATE messages SET is_compressed = 1 WHERE session_id = ? AND is_compressed = 0',
  ).run(sessionId);
}

/**
 * 获取指定消息之后（不含该消息本身）的所有消息 id，与 deleteMessagesAfter 条件一致
 * @param {string} messageId
 * @returns {string[]}
 */
export function getMessageIdsAfter(messageId) {
  const msg = db.prepare('SELECT session_id, created_at FROM messages WHERE id = ?').get(messageId);
  if (!msg) return [];
  return db.prepare(
    'SELECT id FROM messages WHERE session_id = ? AND created_at > ?',
  ).all(msg.session_id, msg.created_at).map((r) => r.id);
}
