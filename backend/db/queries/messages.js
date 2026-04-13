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
