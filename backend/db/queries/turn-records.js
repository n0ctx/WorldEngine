import crypto from 'node:crypto';
import db from '../index.js';

/**
 * 取会话最近 N 条 turn 摘要，按 round_index 升序返回（用于时间线）。
 * 只取已生成摘要的行（summary != ''）。
 *
 * @param {string} sessionId
 * @param {number} limit
 * @returns {Array<{ round_index:number, summary:string, created_at:number }>}
 */
export function getRecentTurnSummaries(sessionId, limit) {
  return db.prepare(`
    SELECT round_index, summary, created_at FROM (
      SELECT round_index, summary, created_at FROM turn_records
      WHERE session_id = ? AND summary != ''
      ORDER BY round_index DESC LIMIT ?
    ) ORDER BY round_index ASC
  `).all(sessionId, limit);
}

/**
 * 插入或更新 turn record（按 session_id + round_index UPSERT）
 *
 * @param {object} data - { session_id, round_index, summary, scene, cast_json, user_message_id, asst_message_id, state_snapshot }
 * @returns {object} 写入后的行
 */
export function upsertTurnRecord({ session_id, round_index, summary, scene, cast_json, user_message_id, asst_message_id, state_snapshot }) {
  const existing = db.prepare(
    'SELECT id FROM turn_records WHERE session_id = ? AND round_index = ?',
  ).get(session_id, round_index);

  const now = Date.now();

  if (existing) {
    db.prepare(`
      UPDATE turn_records
      SET summary = ?, scene = ?, cast_json = ?, user_message_id = ?, asst_message_id = ?, state_snapshot = ?, created_at = ?
      WHERE id = ?
    `).run(summary, scene ?? null, cast_json ?? null, user_message_id ?? null, asst_message_id ?? null, state_snapshot ?? null, now, existing.id);
    return getTurnRecordById(existing.id);
  } else {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO turn_records (id, session_id, round_index, summary, scene, cast_json, user_message_id, asst_message_id, state_snapshot, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, session_id, round_index, summary, scene ?? null, cast_json ?? null, user_message_id ?? null, asst_message_id ?? null, state_snapshot ?? null, now);
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
 * 回填指定 turn record 的长期记忆索引字段（摘要 / 场景 / 在场角色）。
 *
 * @param {string} id
 * @param {{ summary:string, scene?:string, cast_json?:string }} data
 * @returns {number} 变更的行数
 */
export function updateTurnRecordIndex(id, { summary, scene, cast_json }) {
  return db.prepare(
    'UPDATE turn_records SET summary = ?, scene = ?, cast_json = ? WHERE id = ?',
  ).run(summary, scene ?? null, cast_json ?? null, id).changes;
}

/**
 * 取会话内已生成索引行的全部 turn record 的索引字段，按 round_index 升序返回；
 * 供上下文压缩取场景（剧情阶段与当前场景保护）、长期召回列目录使用。
 *
 * @param {string} sessionId
 * @returns {Array<{ round_index:number, summary:string, scene:string|null, cast_json:string|null }>}
 */
export function getTurnIndexRows(sessionId) {
  return db.prepare(`
    SELECT round_index, summary, scene, cast_json FROM turn_records
    WHERE session_id = ? AND summary != ''
    ORDER BY round_index ASC
  `).all(sessionId);
}

/**
 * 取会话内尚未生成摘要（summary = ''）的 turn record，按 round_index 升序返回，
 * 供索引回填任务批量处理。
 *
 * @param {string} sessionId
 * @param {number} limit
 * @returns {object[]}
 */
export function getUnindexedTurnRecords(sessionId, limit) {
  return db.prepare(`
    SELECT * FROM turn_records
    WHERE session_id = ? AND summary = ''
    ORDER BY round_index ASC LIMIT ?
  `).all(sessionId, limit);
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

