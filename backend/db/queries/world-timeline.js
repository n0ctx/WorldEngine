import crypto from 'node:crypto';
import db from '../index.js';

/**
 * 批量插入时间线条目（原子操作，seq 在事务内取 MAX+1 递增）
 *
 * @param {string} worldId
 * @param {string[]} contents — 事件文本数组
 * @returns {object[]} 插入的行数组
 */
export function insertTimelineEntries(worldId, contents) {
  if (!contents || contents.length === 0) return [];

  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO world_timeline (id, world_id, content, is_compressed, seq, created_at)
    VALUES (?, ?, ?, 0, ?, ?)
  `);

  const tx = db.transaction(() => {
    const maxRow = db.prepare(
      'SELECT MAX(seq) AS m FROM world_timeline WHERE world_id = ?',
    ).get(worldId);
    let nextSeq = (maxRow?.m ?? 0) + 1;

    const rows = [];
    for (const content of contents) {
      const id = crypto.randomUUID();
      stmt.run(id, worldId, content, nextSeq, now);
      rows.push({ id, world_id: worldId, content, is_compressed: 0, seq: nextSeq, created_at: now });
      nextSeq++;
    }
    return rows;
  });

  return tx();
}

/**
 * 返回某世界时间线的总条目数
 *
 * @param {string} worldId
 * @returns {number}
 */
export function countTimelineEntries(worldId) {
  return db.prepare(
    'SELECT COUNT(*) AS n FROM world_timeline WHERE world_id = ?',
  ).get(worldId).n;
}

/**
 * 按 seq 升序获取最早的 N 条条目
 *
 * @param {string} worldId
 * @param {number} n
 * @returns {object[]}
 */
export function getEarliestEntries(worldId, n) {
  return db.prepare(
    'SELECT * FROM world_timeline WHERE world_id = ? ORDER BY seq ASC LIMIT ?',
  ).all(worldId, n);
}

/**
 * 将最早的 count 条条目替换为一条 is_compressed=1 的摘要行（原子操作）。
 * 压缩摘要继承被删条目中最小的 seq，保持时序正确。
 *
 * @param {string} worldId
 * @param {number} count — 要删除的条目数
 * @param {string} summaryContent — LLM 生成的摘要文本
 */
export function compressEarliestEntries(worldId, count, summaryContent) {
  const tx = db.transaction(() => {
    const entries = db.prepare(
      'SELECT id, seq FROM world_timeline WHERE world_id = ? ORDER BY seq ASC LIMIT ?',
    ).all(worldId, count);

    if (entries.length === 0) return;

    const minSeq = entries[0].seq;
    const ids = entries.map((e) => e.id);
    const placeholders = ids.map(() => '?').join(',');

    db.prepare(`DELETE FROM world_timeline WHERE id IN (${placeholders})`).run(...ids);

    const id = crypto.randomUUID();
    const now = Date.now();
    db.prepare(`
      INSERT INTO world_timeline (id, world_id, content, is_compressed, seq, created_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `).run(id, worldId, summaryContent, minSeq, now);
  });

  tx();
}

/**
 * Upsert 世界时间线：同 world+session 组合覆盖，不存在则插入（one-row-per-session）
 *
 * @param {string} worldId
 * @param {string} sessionId
 * @param {string} content — 该 session 的摘要文本
 */
export function upsertSessionTimeline(worldId, sessionId, content) {
  const now = Date.now();
  const existing = db.prepare(
    'SELECT id FROM world_timeline WHERE world_id = ? AND session_id = ?',
  ).get(worldId, sessionId);

  if (existing) {
    db.prepare(
      'UPDATE world_timeline SET content = ?, updated_at = ? WHERE id = ?',
    ).run(content, now, existing.id);
  } else {
    const maxRow = db.prepare(
      'SELECT MAX(seq) AS m FROM world_timeline WHERE world_id = ?',
    ).get(worldId);
    const seq = (maxRow?.m ?? 0) + 1;
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO world_timeline (id, world_id, session_id, content, is_compressed, seq, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?, ?)
    `).run(id, worldId, sessionId, content, seq, now, now);
  }
}

/**
 * 获取某世界时间线，按 seq 升序
 *
 * @param {string} worldId
 * @param {number} [limit]
 * @returns {object[]}
 */
export function getTimelineByWorldId(worldId, limit) {
  if (limit != null) {
    return db.prepare(
      'SELECT * FROM world_timeline WHERE world_id = ? ORDER BY seq ASC LIMIT ?',
    ).all(worldId, limit);
  }
  return db.prepare(
    'SELECT * FROM world_timeline WHERE world_id = ? ORDER BY seq ASC',
  ).all(worldId);
}
