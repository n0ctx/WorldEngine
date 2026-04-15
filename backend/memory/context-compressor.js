/**
 * context-compressor.js — T32 轮次压缩核心逻辑
 *
 * 对外暴露：
 *   maybeCompress(sessionId, { force = false } = {})
 *     - force=false：仅当未压缩轮次 >= threshold 时触发压缩
 *     - force=true ：跳过阈值检查，直接压缩（用于手动 /summary 触发）
 */

import { getConfig } from '../services/config.js';
import { countUncompressedRounds, markAllMessagesCompressed } from '../db/queries/messages.js';
import { setCompressedContext, getSessionById } from '../db/queries/sessions.js';
import { getSummaryBySessionId } from '../db/queries/session-summaries.js';
import { generateSummary } from './summarizer.js';
import { embedSessionSummary } from './summary-embedder.js';
import { upsertSessionTimeline } from '../db/queries/world-timeline.js';
import { getCharacterById } from '../db/queries/characters.js';

/**
 * 检查是否达到压缩阈值，达到则执行完整压缩流程：
 *   1. 生成 session summary
 *   2. 快照到 sessions.compressed_context
 *   3. 标记所有未压缩消息
 *   4. Upsert 世界时间线（per-session）
 *   5. 异步触发 embedding
 *
 * @param {string} sessionId
 * @param {{ force?: boolean }} [options]
 */
export async function maybeCompress(sessionId, { force = false } = {}) {
  const config = getConfig();
  const threshold = config.context_compress_rounds || 10;

  if (!force) {
    const rounds = countUncompressedRounds(sessionId);
    if (rounds < threshold) return;
  }

  // 1. 生成摘要（仅在压缩阈值到达时才调用）
  await generateSummary(sessionId);

  // 2. 读取刚生成的摘要并快照到 compressed_context
  const summary = getSummaryBySessionId(sessionId);
  if (!summary?.content) return;

  setCompressedContext(sessionId, summary.content);

  // 3. 标记所有未压缩消息为已压缩（轮次计数自动归零）
  markAllMessagesCompressed(sessionId);

  // 4. Upsert 世界时间线（per-session，同 session 多次压缩时覆盖）
  const session = getSessionById(sessionId);
  if (session?.character_id) {
    const character = getCharacterById(session.character_id);
    if (character?.world_id) {
      upsertSessionTimeline(character.world_id, sessionId, summary.content);
    }
  }

  // 5. 触发 embedding（异步，不阻塞）
  embedSessionSummary(sessionId).catch(() => {});
}
