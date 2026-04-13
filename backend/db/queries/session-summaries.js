import crypto from 'node:crypto';
import db from '../index.js';

/**
 * 插入或更新摘要（每个 session 至多一条）
 */
export function upsertSummary(sessionId, content) {
  const existing = db.prepare('SELECT id FROM session_summaries WHERE session_id = ?').get(sessionId);
  const now = Date.now();

  if (existing) {
    db.prepare('UPDATE session_summaries SET content = ?, updated_at = ? WHERE session_id = ?')
      .run(content, now, sessionId);
    return db.prepare('SELECT * FROM session_summaries WHERE session_id = ?').get(sessionId);
  } else {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO session_summaries (id, session_id, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, sessionId, content, now, now);
    return db.prepare('SELECT * FROM session_summaries WHERE id = ?').get(id);
  }
}

/**
 * 获取某会话的摘要
 */
export function getSummaryBySessionId(sessionId) {
  return db.prepare('SELECT * FROM session_summaries WHERE session_id = ?').get(sessionId);
}
