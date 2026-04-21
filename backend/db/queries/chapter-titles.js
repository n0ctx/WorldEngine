import db from '../index.js';
import crypto from 'node:crypto';

/**
 * 获取指定会话的所有章节标题。
 * @param {string} sessionId
 * @returns {Array<{chapter_index: number, title: string, is_default: number}>}
 */
export function getChapterTitlesBySessionId(sessionId) {

  return db.prepare(
    'SELECT chapter_index, title, is_default FROM chapter_titles WHERE session_id = ? ORDER BY chapter_index'
  ).all(sessionId);
}

/**
 * 获取单个章节标题记录。
 * @param {string} sessionId
 * @param {number} chapterIndex
 * @returns {{chapter_index: number, title: string, is_default: number} | undefined}
 */
export function getChapterTitle(sessionId, chapterIndex) {

  return db.prepare(
    'SELECT chapter_index, title, is_default FROM chapter_titles WHERE session_id = ? AND chapter_index = ?'
  ).get(sessionId, chapterIndex);
}

/**
 * 插入或更新章节标题。
 * @param {string} sessionId
 * @param {number} chapterIndex
 * @param {string} title
 * @param {0|1} isDefault  1=占位默认，0=LLM/用户真实标题
 */
export function upsertChapterTitle(sessionId, chapterIndex, title, isDefault) {

  const now = Date.now();
  db.prepare(`
    INSERT INTO chapter_titles (id, session_id, chapter_index, title, is_default, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, chapter_index)
    DO UPDATE SET title = excluded.title, is_default = excluded.is_default, updated_at = excluded.updated_at
  `).run(crypto.randomUUID(), sessionId, chapterIndex, title, isDefault ? 1 : 0, now, now);
}
