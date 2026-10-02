/**
 * turn-summarizer.js — per-turn 建行与索引：每轮对话结束后（状态更新完毕后）创建 turn record，
 * 再异步为记录回填「历史轮次目录」索引
 *
 * 对外暴露：
 *   createTurnRecord(sessionId)
 *     为最后一轮（round = splitRounds 的最后一轮）建行：写中期摘要指针与状态快照，
 *     summary 留空，交给长期记忆索引回填（generateTurnIndex）另行生成。
 *   generateTurnIndex(sessionId)
 *     为最新一轮（若尚未生成索引）与最多 TURN_INDEX_BACKFILL_MAX 条更早未索引记录
 *     调用辅助模型生成 {scene, cast, summary} 索引行；失败的记录 summary 保持 ''，下次自动重试。
 */

import * as llm from '../llm/index.js';
import { getSessionById } from '../db/queries/sessions.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getMessagesBySessionId } from '../db/queries/messages.js';
import {
  upsertTurnRecord,
  updateTurnRecordIndex,
  getLatestTurnRecord,
  getUnindexedTurnRecords,
} from '../db/queries/turn-records.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import {
  ALL_MESSAGES_LIMIT,
  LLM_TASK_TEMPERATURE,
  LLM_TURN_SUMMARY_MAX_TOKENS,
  LLM_BACKGROUND_TASK_TIMEOUT_MS,
  LONG_TERM_INDEX_MAX_TOKENS,
  TURN_INDEX_BACKFILL_MAX,
  TURN_SUMMARY_CAST_MAX,
} from '../utils/constants.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { captureFullSnapshot } from './state-rollback.js';
import { splitRounds } from '../utils/session-rounds.js';
import { computeMiddleSummary, resolveNames } from './middle-summary.js';
import { resolveAuxScope } from '../utils/aux-scope.js';
import { countTokens } from '../utils/token-counter.js';
import { stripThinkBlocksFromText, toPromptMessage } from '../utils/turn-dialogue.js';

/**
 * 从 LLM 原始输出中解析 JSON 结构 {scene, cast[], summary}。
 * - 先剥 markdown 围栏，再提取首尾大括号之间的 JSON
 * - 解析失败：整段当摘要、无锚点（保持降级行为）
 */
function parseSummaryPayload(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { summary: '', scene: '', cast: [] };

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
    return { summary, scene, cast };
  } catch {
    return { summary: text, scene: '', cast: [] };
  }
}

/** 索引行格式：#<round>｜<scene>｜<cast 用、连接>｜<summary>，空字段省略（与 long-term-recall.js 渲染格式一致） */
function renderIndexLine(roundIndex, scene, cast, summary) {
  return [`#${roundIndex}`, scene || '', cast.join('、'), summary].filter(Boolean).join('｜');
}

/** 整条索引行超 LONG_TERM_INDEX_MAX_TOKENS 时逐字截断 summary，直到放得下为止 */
function truncateSummaryToBudget(roundIndex, scene, cast, summary) {
  let text = summary;
  while (text.length > 0 && countTokens(renderIndexLine(roundIndex, scene, cast, text)) > LONG_TERM_INDEX_MAX_TOKENS) {
    text = text.slice(0, -1);
  }
  return text;
}

/** 在 rounds（splitRounds 结果）中按轮号取该轮首条 user 与末条 assistant 消息 */
function findRoundMessages(rounds, roundIndex) {
  const round = rounds.find((r) => r.roundIndex === roundIndex);
  if (!round) return { userMsg: null, asstMsg: null };
  const userMsg = round.messages.find((msg) => msg.role === 'user') ?? null;
  const asstCandidates = round.messages.filter((msg) => msg.role === 'assistant');
  const asstMsg = asstCandidates[asstCandidates.length - 1] ?? null;
  return { userMsg, asstMsg };
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

  const allMsgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0).map(toPromptMessage);
  const rounds = splitRounds(allMsgs);
  if (rounds.length === 0) {
    log.info(`SKIP  ${formatMeta({ session: sid, reason: 'no-rounds' })}`);
    return;
  }

  const round_index = rounds[rounds.length - 1].roundIndex;
  const { userMsg, asstMsg } = findRoundMessages(rounds, round_index);

  if (!userMsg || !asstMsg) {
    log.info(`SKIP  ${formatMeta({ session: sid, round: round_index, reason: 'missing-round-pair' })}`);
    return;
  }

  const character = session.character_id ? getCharacterById(session.character_id) : null;
  const worldId = character?.world_id ?? session.world_id;

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

  const snapshot = captureTurnSnapshot(sessionId, worldId, session.character_id);

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

  log.info(`DONE  ${formatMeta({ session: sid, round: round_index, recordId: record?.id ?? null })}`);

  if (middle.failed) {
    throw new Error(middle.error || '中期摘要生成失败');
  }
}

function captureTurnSnapshot(sessionId, worldId, characterId) {
  if (!worldId) return null;
  return captureFullSnapshot(sessionId, worldId, characterId ? [characterId] : []);
}

/**
 * 为单条 turn record 生成并写入索引行；失败（含调用异常、空摘要）时不写入，只记 warn。
 *
 * @returns {Promise<boolean>} 是否成功写入索引
 */
async function indexOneRecord(sessionId, sid, record, rounds, userName, characterName) {
  const { userMsg, asstMsg } = findRoundMessages(rounds, record.round_index);
  if (!userMsg || !asstMsg) {
    log.warn(`INDEX SKIP  ${formatMeta({ session: sid, round: record.round_index, reason: 'missing-round-pair' })}`);
    return false;
  }

  try {
    const raw = await llm.complete([{
      role: 'user',
      content: renderBackendPrompt('memory-turn-summary.md', {
        USER_NAME: userName,
        CHARACTER_NAME: characterName,
        USER_MESSAGE: userMsg.content,
        ASSISTANT_MESSAGE: asstMsg.content,
      }),
    }], {
      temperature: LLM_TASK_TEMPERATURE,
      maxTokens: LLM_TURN_SUMMARY_MAX_TOKENS,
      configScope: resolveAuxScope(sessionId),
      callType: 'turn_index',
      conversationId: sessionId,
      timeoutMs: LLM_BACKGROUND_TASK_TIMEOUT_MS,
    });

    const payload = parseSummaryPayload(stripThinkBlocksFromText(raw));
    const summary = payload.summary
      .replace(/^\s*\*{1,2}[^*\n]{0,20}[：:]\*{0,2}\s*/u, '')
      .trim();
    if (!summary) {
      log.warn(`INDEX EMPTY  ${formatMeta({ session: sid, round: record.round_index })}`);
      return false;
    }

    const truncated = truncateSummaryToBudget(record.round_index, payload.scene, payload.cast, summary);
    const changes = updateTurnRecordIndex(record.id, {
      summary: truncated,
      scene: payload.scene || null,
      cast_json: payload.cast.length > 0 ? JSON.stringify(payload.cast) : null,
    });
    log.info(`INDEXED  ${formatMeta({ session: sid, round: record.round_index, changes })}`);
    return true;
  } catch (err) {
    log.warn(`INDEX FAIL  ${formatMeta({ session: sid, round: record.round_index, error: err.message })}`);
    return false;
  }
}

/**
 * 挑出本次要索引的记录：最新一轮（summary=''时）排在最前，
 * 之后是最多 TURN_INDEX_BACKFILL_MAX 条更早未索引记录（从最老开始，不与最新一条重复）。
 */
function collectRecordsToIndex(sessionId) {
  const latest = getLatestTurnRecord(sessionId);
  const backfillCandidates = getUnindexedTurnRecords(sessionId, TURN_INDEX_BACKFILL_MAX + 1)
    .filter((r) => r.id !== latest?.id)
    .slice(0, TURN_INDEX_BACKFILL_MAX);
  const records = latest && latest.summary === '' ? [latest, ...backfillCandidates] : backfillCandidates;
  return { records, backfillCount: backfillCandidates.length };
}

/** 依次为 records 生成索引，返回成功/失败条数 */
async function indexRecords(sessionId, sid, records, rounds, userName, characterName) {
  let indexed = 0;
  let failed = 0;
  for (const record of records) {
    const ok = await indexOneRecord(sessionId, sid, record, rounds, userName, characterName);
    if (ok) indexed++; else failed++;
  }
  return { indexed, failed };
}

/**
 * 为最新一轮（summary=''时）与最多 TURN_INDEX_BACKFILL_MAX 条更早未索引记录生成索引行。
 * 记录已被回滚删掉时 updateTurnRecordIndex 更新 0 行，静默结束。
 *
 * @param {string} sessionId
 */
export async function generateTurnIndex(sessionId) {
  const sid = sessionId.slice(0, 8);
  const session = getSessionById(sessionId);
  if (!session) { log.warn(`session not found  session=${sid}`); return; }

  const { userName, characterName } = resolveNames(session);
  const rounds = splitRounds(getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0).map(toPromptMessage));

  const { records, backfillCount } = collectRecordsToIndex(sessionId);
  const { indexed, failed } = await indexRecords(sessionId, sid, records, rounds, userName, characterName);

  const remaining = getUnindexedTurnRecords(sessionId, Number.MAX_SAFE_INTEGER).length;
  log.info(`DONE  ${formatMeta({ session: sid, indexed, failed, backfilled: backfillCount, remaining })}`);
}

export const __testables = {
  parseSummaryPayload,
  truncateSummaryToBudget,
};
