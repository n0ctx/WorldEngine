import crypto from 'node:crypto';
import db from '../index.js';

/**
 * 插入或更新 turn record（按 session_id + round_index UPSERT）
 *
 * @param {object} data - { session_id, round_index, summary, user_message_id, asst_message_id, state_snapshot }
 * @returns {object} 写入后的行
 */
export function upsertTurnRecord({ session_id, round_index, summary, user_message_id, asst_message_id, state_snapshot }) {
  const existing = db.prepare(
    'SELECT id FROM turn_records WHERE session_id = ? AND round_index = ?',
  ).get(session_id, round_index);

  const now = Date.now();

  if (existing) {
    db.prepare(`
      UPDATE turn_records
      SET summary = ?, user_message_id = ?, asst_message_id = ?, state_snapshot = ?, created_at = ?
      WHERE id = ?
    `).run(summary, user_message_id ?? null, asst_message_id ?? null, state_snapshot ?? null, now, existing.id);
    return getTurnRecordById(existing.id);
  } else {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO turn_records (id, session_id, round_index, summary, user_message_id, asst_message_id, state_snapshot, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, session_id, round_index, summary, user_message_id ?? null, asst_message_id ?? null, state_snapshot ?? null, now);
    return getTurnRecordById(id);
  }
}

/**
 * 按 id 获取单条 turn record
 */
export function getTurnRecordById(id) {
  return db.prepare('SELECT * FROM turn_records WHERE id = ?').get(id);
}

/**
 * 获取某会话最近 limit 条 turn records，按 round_index 升序返回
 *
 * @param {string} sessionId
 * @param {number} limit
 * @returns {object[]}
 */
export function getTurnRecordsBySessionId(sessionId, limit) {
  const rows = db.prepare(`
    SELECT * FROM (
      SELECT * FROM turn_records WHERE session_id = ? ORDER BY round_index DESC LIMIT ?
    ) ORDER BY round_index ASC
  `).all(sessionId, limit);
  return rows;
}

/**
 * 获取某会话最后一条 turn record（round_index 最大）
 *
 * @param {string} sessionId
 * @returns {object|undefined}
 */
export function getLatestTurnRecord(sessionId) {
  return db.prepare(
    'SELECT * FROM turn_records WHERE session_id = ? ORDER BY round_index DESC LIMIT 1',
  ).get(sessionId);
}

/**
 * 获取某会话所有 turn records，按 round_index 升序
 *
 * @param {string} sessionId
 * @returns {object[]}
 */
export function getAllTurnRecordsBySessionId(sessionId) {
  return db.prepare(
    'SELECT * FROM turn_records WHERE session_id = ? ORDER BY round_index ASC',
  ).all(sessionId);
}

/**
 * 统计某会话的 turn record 数量
 */
export function countTurnRecords(sessionId) {
  return db.prepare(
    'SELECT COUNT(*) AS n FROM turn_records WHERE session_id = ?',
  ).get(sessionId).n;
}

/**
 * 删除某会话 round_index 最大的那条 turn record（regenerate 用）
 */
export function deleteLastTurnRecord(sessionId) {
  const last = getLatestTurnRecord(sessionId);
  if (!last) return;
  db.prepare('DELETE FROM turn_records WHERE id = ?').run(last.id);
}

/**
 * 获取某会话 state_snapshot 不为 null 的最新一条 turn record
 * 用于回滚：跳过无快照的旧记录，找到最近的有效状态锚点
 *
 * @param {string} sessionId
 * @returns {object|undefined}
 */
export function getLatestTurnRecordWithSnapshot(sessionId) {
  return db.prepare(
    'SELECT * FROM turn_records WHERE session_id = ? AND state_snapshot IS NOT NULL ORDER BY round_index DESC LIMIT 1',
  ).get(sessionId);
}

/**
 * 删除某会话 round_index > roundIndex 的所有 turn records
 */
export function deleteTurnRecordsAfterRound(sessionId, roundIndex) {
  db.prepare(
    'DELETE FROM turn_records WHERE session_id = ? AND round_index > ?',
  ).run(sessionId, roundIndex);
}

/**
 * 删除某会话的所有 turn records（级联删除兜底，正常由 ON DELETE CASCADE 处理）
 */
export function deleteTurnRecordsBySessionId(sessionId) {
  db.prepare('DELETE FROM turn_records WHERE session_id = ?').run(sessionId);
}
