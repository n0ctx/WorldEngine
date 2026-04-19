/**
 * summary-embedder.js — 对话后将 session summary 向量化并写入向量库
 *
 * 对外暴露：
 *   embedSessionSummary(sessionId) → Promise<void>
 *
 * - embedding 未配置时静默退出，不报错
 * - 任何异常 catch 后仅 console.warn，不抛出（此任务属异步队列优先级 5，可丢弃）
 */

import db from '../db/index.js';
import { getSummaryBySessionId } from '../db/queries/session-summaries.js';
import { embed } from '../llm/embedding.js';
import { upsertEntry } from '../utils/session-summary-vector-store.js';

/**
 * 读取 sessionId 对应的 summary，计算 embedding 后写入向量库。
 *
 * @param {string} sessionId
 */
export async function embedSessionSummary(sessionId) {
  try {
    const summary = getSummaryBySessionId(sessionId);
    if (!summary?.content) return; // 尚无摘要，跳过

    // 通过 session → character 拿到 world_id
    const row = db.prepare(`
      SELECT c.world_id
      FROM sessions s
      JOIN characters c ON s.character_id = c.id
      WHERE s.id = ?
    `).get(sessionId);
    if (!row) return;

    const vector = await embed(summary.content);
    if (!vector) return; // embedding 未配置，静默退出

    upsertEntry(summary.id, sessionId, row.world_id, vector);
  } catch (err) {
    console.warn('[summary-embedder] embedSessionSummary failed:', err.message);
  }
}
