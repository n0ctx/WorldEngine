/**
 * world-timeline.js — 压缩时更新世界时间线（per-session upsert）
 *
 * 不再使用 LLM 提取事件；直接将 session summary 作为该 session 的时间线条目。
 * 由 context-compressor.js 内部调用，不再作为独立异步队列任务。
 */

import { getSessionById } from '../services/sessions.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getSummaryBySessionId } from '../db/queries/session-summaries.js';
import { upsertSessionTimeline } from '../db/queries/world-timeline.js';

/**
 * 将 session 的摘要 upsert 到世界时间线（one-row-per-session）。
 * 同一 session 多次压缩时，覆盖原有记录。
 *
 * @param {string} sessionId
 */
export async function appendWorldTimeline(sessionId) {
  const session = getSessionById(sessionId);
  if (!session?.character_id) return;

  const character = getCharacterById(session.character_id);
  if (!character?.world_id) return;

  const summaryRow = getSummaryBySessionId(sessionId);
  if (!summaryRow?.content) return;

  upsertSessionTimeline(character.world_id, sessionId, summaryRow.content);
}
