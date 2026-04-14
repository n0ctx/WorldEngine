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

/**
 * 根据 summary id 获取摘要及关联元信息（session 标题、创建时间、world_id）
 *
 * @param {string} summaryId  session_summaries.id
 * @returns {{ id, session_id, content, session_title, session_created_at, world_id, character_id } | undefined}
 */
export function getSummaryWithMetaById(summaryId) {
  return db.prepare(`
    SELECT
      ss.id,
      ss.session_id,
      ss.content,
      s.title   AS session_title,
      s.created_at AS session_created_at,
      c.world_id,
      s.character_id
    FROM session_summaries ss
    JOIN sessions   s ON ss.session_id = s.id
    JOIN characters c ON s.character_id = c.id
    WHERE ss.id = ?
  `).get(summaryId);
}

/**
 * 列出某世界下所有摘要（排除指定 session），按 session 更新时间倒序
 * 主要供调试/开发使用；LLM 注入路径走向量搜索而非此函数。
 *
 * @param {string} worldId
 * @param {string} excludeSessionId
 * @returns {Array<{ id, session_id, content, session_title, session_created_at, world_id, character_id }>}
 */
export function listSummariesByWorldId(worldId, excludeSessionId) {
  return db.prepare(`
    SELECT
      ss.id,
      ss.session_id,
      ss.content,
      s.title   AS session_title,
      s.created_at AS session_created_at,
      c.world_id,
      s.character_id
    FROM session_summaries ss
    JOIN sessions   s ON ss.session_id = s.id
    JOIN characters c ON s.character_id = c.id
    WHERE c.world_id = ? AND ss.session_id != ?
    ORDER BY s.updated_at DESC
  `).all(worldId, excludeSessionId);
}
