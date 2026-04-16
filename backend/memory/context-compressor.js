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
import { createLogger } from '../utils/logger.js';

const log = createLogger('compress');

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
  const sid = sessionId.slice(0, 8);

  if (!force) {
    const rounds = countUncompressedRounds(sessionId);
    if (rounds < threshold) {
      log.debug(`SKIP  session=${sid}  rounds=${rounds}/${threshold}`);
      return;
    }
    log.debug(`TRIGGER  session=${sid}  rounds=${rounds}>=${threshold}`);
  } else {
    log.debug(`FORCE  session=${sid}`);
  }

  // 1. 生成摘要（仅在压缩阈值到达时才调用）
  log.debug(`step 1/5  generate summary  session=${sid}`);
  await generateSummary(sessionId);

  // 2. 读取刚生成的摘要并快照到 compressed_context
  const summary = getSummaryBySessionId(sessionId);
  if (!summary?.content) {
    log.warn(`no summary generated, aborting compress  session=${sid}`);
    return;
  }

  log.debug(`step 2/5  snapshot compressed_context  session=${sid}  len=${summary.content.length}`);
  setCompressedContext(sessionId, summary.content);

  // 3. 标记所有未压缩消息为已压缩（轮次计数自动归零）
  log.debug(`step 3/5  mark messages compressed  session=${sid}`);
  markAllMessagesCompressed(sessionId);

  // 4. Upsert 世界时间线（per-session，同 session 多次压缩时覆盖）
  const session = getSessionById(sessionId);
  if (session?.character_id) {
    const character = getCharacterById(session.character_id);
    if (character?.world_id) {
      log.debug(`step 4/5  upsert world timeline  session=${sid}  world=${character.world_id.slice(0, 8)}`);
      upsertSessionTimeline(character.world_id, sessionId, summary.content);
    }
  }

  // 5. 触发 embedding（异步，不阻塞）
  log.debug(`step 5/5  trigger embedding  session=${sid}`);
  embedSessionSummary(sessionId).catch(() => {});

  log.info(`DONE  session=${sid}`);
}
