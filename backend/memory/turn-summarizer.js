/**
 * turn-summarizer.js — per-turn 建行：每轮对话结束后（状态更新完毕后）创建 turn record
 *
 * 对外暴露：
 *   createTurnRecord(sessionId)
 *     为最后一轮（round = splitRounds 的最后一轮）建行：写中期摘要指针与状态快照，
 *     summary 留空，交给长期记忆索引回填（generateTurnIndex）另行生成。
 */

import { getSessionById } from '../db/queries/sessions.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getMessagesBySessionId } from '../db/queries/messages.js';
import { upsertTurnRecord, updateTurnRecordTableSnapshot } from '../db/queries/turn-records.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import {
  ALL_MESSAGES_LIMIT,
  LONG_TERM_MEMORY_PER_TURN_MAX,
  TURN_SUMMARY_CAST_MAX,
} from '../utils/constants.js';
import { captureFullSnapshot } from './state-rollback.js';
import { readTablesRaw } from '../services/table-memory.js';
import { splitRounds } from '../utils/session-rounds.js';
import { computeMiddleSummary } from './middle-summary.js';

/**
 * 从 LLM 原始输出中解析 JSON 结构 {scene, cast[], summary, memory[]}。
 * - 先剥 markdown 围栏，再提取首尾大括号之间的 JSON
 * - 解析失败：整段当摘要、无锚点、零 memory（保持降级行为）
 */
function parseSummaryPayload(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { summary: '', scene: '', cast: [], memoryLines: [] };

  let body = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start >= 0 && end > start) body = body.slice(start, end + 1);

  try {
    const obj = JSON.parse(body);
    const summary = typeof obj.summary === 'string' ? obj.summary : '';
    const scene = typeof obj.scene === 'string' ? obj.scene.trim() : '';
    const castArr = Array.isArray(obj.cast) ? obj.cast : [];
    const cast = castArr
      .map((n) => String(n ?? '').trim())
      .filter(Boolean)
      .slice(0, TURN_SUMMARY_CAST_MAX);
    const memArr = Array.isArray(obj.memory) ? obj.memory : [];
    const memoryLines = memArr
      .map((l) => String(l ?? '').replace(/^\s*[-*•·\d.)]+\s*/, '').trim())
      .filter(Boolean)
      .slice(0, LONG_TERM_MEMORY_PER_TURN_MAX);
    return { summary, scene, cast, memoryLines };
  } catch {
    return { summary: text, scene: '', cast: [], memoryLines: [] };
  }
}

const log = createLogger('turn-sum');

/**
 * 为当前 session 最后一轮（splitRounds 切出的最后一轮）建 turn record。
 * 轮号来自消息本身而非已有记录数，避免与历史记录数错位。
 *
 * @param {string} sessionId
 */
export async function createTurnRecord(sessionId) {
  const sid = sessionId.slice(0, 8);
  log.info(`START  ${formatMeta({ session: sid })}`);

  const session = getSessionById(sessionId);
  if (!session) { log.warn(`session not found  session=${sid}`); return; }

  const allMsgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const rounds = splitRounds(allMsgs);
  if (rounds.length === 0) {
    log.info(`SKIP  ${formatMeta({ session: sid, reason: 'no-rounds' })}`);
    return;
  }

  const round = rounds[rounds.length - 1];
  const round_index = round.roundIndex;
  const userMsg = round.messages.find((msg) => msg.role === 'user') ?? null;
  const asstCandidates = round.messages.filter((msg) => msg.role === 'assistant');
  const asstMsg = asstCandidates[asstCandidates.length - 1] ?? null;

  if (!userMsg || !asstMsg) {
    log.info(`SKIP  ${formatMeta({ session: sid, round: round_index, reason: 'missing-round-pair' })}`);
    return;
  }

  const character = session.character_id ? getCharacterById(session.character_id) : null;
  const worldId = character?.world_id ?? session.world_id;
  const isWriting = session.mode === 'writing';

  const middle = await computeMiddleSummary(sessionId, round_index);
  log.info(`MIDDLE  ${formatMeta({
    session: sid,
    round: round_index,
    windowTokens: middle.windowTokens,
    windowRounds: middle.windowRounds,
    evicted: middle.evicted ? middle.evicted.join('-') : null,
    middleTokens: middle.middleTokens,
    coveredTo: middle.coveredTo,
    failed: middle.failed,
  })}`);

  // 写作模式即使没有 nearby 角色也要写入空层，回滚时才能清掉目标轮中已不存在的角色状态；chat 保持旧记录兼容。
  const snapshot = captureTurnSnapshot(sessionId, worldId, session.character_id, isWriting);

  const record = upsertTurnRecord({
    session_id: sessionId,
    round_index,
    summary: '',
    scene: null,
    cast_json: null,
    user_message_id: userMsg.id,
    asst_message_id: asstMsg.id,
    state_snapshot: snapshot ? JSON.stringify(snapshot) : null,
    middle_summary: middle.text,
    middle_covered_to: middle.coveredTo,
  });

  // tables.json 依赖 priority 2 的 table-memory 任务先写入。
  if (record) {
    try {
      updateTurnRecordTableSnapshot(record.id, readTablesRaw(sessionId));
    } catch (err) {
      log.warn(`TABLE SNAPSHOT FAIL  ${formatMeta({ session: sid, error: err.message })}`);
    }
  }

  log.info(`DONE  ${formatMeta({ session: sid, round: round_index, recordId: record?.id ?? null })}`);

  if (middle.failed) {
    throw new Error(middle.error || '中期摘要生成失败');
  }
}

function captureTurnSnapshot(sessionId, worldId, characterId, isWriting) {
  if (!worldId) return null;
  return captureFullSnapshot(sessionId, worldId, characterId ? [characterId] : [], isWriting);
}

export const __testables = {
  parseSummaryPayload,
};
