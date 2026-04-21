/**
 * daily-entries.js — daily_entries 表的全部 DB 操作
 *
 * 对外暴露：
 *   upsertDailyEntry(data) → record
 *   getDailyEntriesBySessionId(sessionId) → entries[]（按 date_str ASC）
 *   getDailyEntriesAfterRound(sessionId, roundIndex) → entries[]
 *   deleteDailyEntriesAfterRound(sessionId, roundIndex) → void
 *   deleteDailyEntriesBySessionId(sessionId) → void
 *   getSessionIdsByWorldId(worldId) — 已在 characters.js，此处不重复
 */

import { randomUUID } from 'node:crypto';
import db from '../index.js';

/**
 * 新建或覆盖一条日记条目（按 session_id + date_str UPSERT）
 */
export function upsertDailyEntry({ session_id, date_str, date_display, summary, triggered_by_round_index }) {
  const now = Date.now();
  const existing = db.prepare(
    'SELECT id FROM daily_entries WHERE session_id = ? AND date_str = ?'
  ).get(session_id, date_str);

  if (existing) {
    db.prepare(`
      UPDATE daily_entries
      SET date_display = ?, summary = ?, triggered_by_round_index = ?, created_at = ?
      WHERE id = ?
    `).run(date_display, summary, triggered_by_round_index ?? null, now, existing.id);
    return db.prepare('SELECT * FROM daily_entries WHERE id = ?').get(existing.id);
  }

  const id = randomUUID();
  db.prepare(`
    INSERT INTO daily_entries (id, session_id, date_str, date_display, summary, triggered_by_round_index, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, session_id, date_str, date_display, summary, triggered_by_round_index ?? null, now);
  return db.prepare('SELECT * FROM daily_entries WHERE id = ?').get(id);
}

/**
 * 获取某会话所有日记条目，按 date_str ASC
 */
export function getDailyEntriesBySessionId(sessionId) {
  return db.prepare(
    'SELECT * FROM daily_entries WHERE session_id = ? ORDER BY date_str ASC'
  ).all(sessionId);
}

/**
 * 获取触发轮次 >= roundIndex 的日记条目（用于删除/regenerate 时定位需清理的记录）
 */
export function getDailyEntriesAfterRound(sessionId, roundIndex) {
  return db.prepare(
    'SELECT * FROM daily_entries WHERE session_id = ? AND triggered_by_round_index >= ?'
  ).all(sessionId, roundIndex);
}

/**
 * 删除触发轮次 >= roundIndex 的日记条目
 */
export function deleteDailyEntriesAfterRound(sessionId, roundIndex) {
  db.prepare(
    'DELETE FROM daily_entries WHERE session_id = ? AND triggered_by_round_index >= ?'
  ).run(sessionId, roundIndex);
}

/**
 * 删除某会话的所有日记条目
 */
export function deleteDailyEntriesBySessionId(sessionId) {
  db.prepare('DELETE FROM daily_entries WHERE session_id = ?').run(sessionId);
}
