/**
 * turn-summarizer.js — per-turn 摘要：每轮对话结束后（状态更新完毕后）创建 turn record
 *
 * 对外暴露：
 *   createTurnRecord(sessionId, { isUpdate? })
 *     isUpdate=false（默认）：round_index = 现有数量 + 1（新建）
 *     isUpdate=true         ：round_index = 最后一条的 round_index（/continue 覆盖最后轮）
 */

import * as llm from '../llm/index.js';
import { getSessionById } from '../db/queries/sessions.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getMessagesBySessionId } from '../db/queries/messages.js';
import { upsertTurnRecord, countTurnRecords, getLatestTurnRecord, getTurnRecordById, updateTurnRecordLtmSnapshot, updateTurnRecordTableSnapshot } from '../db/queries/turn-records.js';
import { embed } from '../llm/embedding.js';
import { upsertEntry } from '../utils/turn-summary-vector-store.js';
import { createLogger, formatMeta, previewText, shouldLogRaw } from '../utils/logger.js';
import {
  ALL_MESSAGES_LIMIT,
  LLM_TASK_TEMPERATURE,
  LLM_TURN_SUMMARY_MAX_TOKENS,
  LONG_TERM_MEMORY_PER_TURN_MAX,
  TURN_SUMMARY_CAST_MAX,
  LLM_BACKGROUND_TASK_TIMEOUT_MS,
} from '../utils/constants.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { getOrCreatePersona } from '../services/personas.js';
import { captureStateSnapshot } from './state-rollback.js';
import { listNearbyBySessionId } from '../db/queries/session-nearby-characters.js';
import { getStateValuesByNearbyId } from '../db/queries/session-nearby-character-state-values.js';
import { resolveAuxScope } from '../utils/aux-scope.js';
import { getConfig } from '../services/config.js';
import { appendMemoryLines, readMemoryFile } from '../services/long-term-memory.js';
import { readTablesRaw } from '../services/table-memory.js';

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

function getRoundMessagePair(allMsgs, roundIndex) {
  const userIndexes = allMsgs
    .map((msg, index) => (msg.role === 'user' ? index : -1))
    .filter((index) => index >= 0);

  const userIndex = userIndexes[roundIndex - 1];
  if (userIndex == null) return { userMsg: null, asstMsg: null };

  const nextUserIndex = userIndexes[roundIndex] ?? allMsgs.length;
  const userMsg = allMsgs[userIndex];
  const assistantCandidates = allMsgs.slice(userIndex + 1, nextUserIndex)
    .filter((msg) => msg.role === 'assistant');
  const asstMsg = assistantCandidates[assistantCandidates.length - 1] ?? null;

  return { userMsg, asstMsg };
}

/**
 * 为当前 session 最近一轮（最后一条 user + 最后一条 assistant）创建 turn record。
 *
 * @param {string} sessionId
 * @param {{ isUpdate?: boolean }} [options]
 *   isUpdate=true 时：覆盖最后一条 turn record（/continue 场景）
 */
export async function createTurnRecord(sessionId, { isUpdate = false } = {}) {
  const sid = sessionId.slice(0, 8);
  log.info(`START  ${formatMeta({ session: sid, isUpdate })}`);

  const context = getTurnContext(sessionId, isUpdate);
  if (!context) { log.warn(`session not found  session=${sid}`); return; }
  const {
    session,
    worldId,
    userName,
    characterName,
    round_index,
    userMsg,
    asstMsg,
  } = context;

  if (!userMsg || !asstMsg) {
    log.info(`SKIP  ${formatMeta({ session: sid, round: round_index, reason: 'missing-round-pair' })}`);
    return;
  }

  const isWriting = session.mode === 'writing';
  const ltmEnabled = isLongTermMemoryEnabled(session);

  // LLM 生成摘要（非流式，temp=0.3）
  const { summary, scene, cast, memoryLines } = await generateTurnSummary({
    sessionId,
    sid,
    userName,
    characterName,
    userMsg,
    asstMsg,
    ltmEnabled,
  });

  if (!summary) {
    log.warn(`SKIP  ${formatMeta({ session: sid, reason: 'empty-summary' })}`);
    return;
  }

  // 写作模式即使没有 nearby 角色也要写入空层，回滚时才能清掉目标轮中已不存在的角色状态；chat 保持旧记录兼容。
  const snapshot = captureTurnSnapshot(sessionId, worldId, session.character_id, isWriting);

  // 写入 DB（upsert by session_id + round_index），存指针而非内容副本
  const record = upsertTurnRecord({
    session_id: sessionId,
    round_index,
    summary,
    scene: scene || null,
    cast_json: cast.length > 0 ? JSON.stringify(cast) : null,
    user_message_id: userMsg.id,
    asst_message_id: asstMsg.id,
    state_snapshot: snapshot ? JSON.stringify(snapshot) : null,
  });

  log.info(`DONE  ${formatMeta({ session: sid, round: round_index, len: summary.length, recordId: record?.id ?? null })}`);

  await persistTurnRecordSnapshots(record, sessionId, sid, ltmEnabled, memoryLines);

  // 异步触发 embedding（不阻塞）
  if (record && worldId) {
    embedTurnRecord(record.id, sessionId, worldId).catch(err => log.warn('embed turn record 失败:', err.message));
  }
}

function getTurnContext(sessionId, isUpdate) {
  const session = getSessionById(sessionId);
  if (!session) return null;

  const character = session.character_id ? getCharacterById(session.character_id) : null;
  const worldId = character?.world_id ?? session.world_id;
  const persona = worldId ? getOrCreatePersona(worldId) : null;
  const allMsgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const round_index = isUpdate
    ? (getLatestTurnRecord(sessionId)?.round_index ?? 1)
    : countTurnRecords(sessionId) + 1;
  const { userMsg, asstMsg } = getRoundMessagePair(allMsgs, round_index);

  return {
    session,
    worldId,
    userName: persona?.name?.trim() || '玩家',
    characterName: character?.name?.trim() || '角色',
    round_index,
    userMsg,
    asstMsg,
  };
}

function isLongTermMemoryEnabled(session) {
  const config = getConfig();
  if (session.mode === 'writing') return config.writing?.long_term_memory_enabled === true;
  return config.long_term_memory_enabled === true;
}

/** 调用副模型生成摘要，失败时回退到本轮问答的前 100 字。 */
async function generateTurnSummary({ sessionId, sid, userName, characterName, userMsg, asstMsg, ltmEnabled }) {
  try {
    const tplName = ltmEnabled ? 'memory-turn-summary-with-ltm.md' : 'memory-turn-summary.md';
    const vars = {
      USER_NAME: userName,
      CHARACTER_NAME: characterName,
      USER_MESSAGE: userMsg.content,
      ASSISTANT_MESSAGE: asstMsg.content,
    };
    const prompt = [{ role: 'user', content: renderBackendPrompt(tplName, vars) }];
    const raw = await llm.complete(prompt, {
      temperature: LLM_TASK_TEMPERATURE,
      maxTokens: LLM_TURN_SUMMARY_MAX_TOKENS,
      configScope: resolveAuxScope(sessionId),
      callType: 'turn_summary',
      conversationId: sessionId,
      timeoutMs: LLM_BACKGROUND_TASK_TIMEOUT_MS,
    });
    const stripped = (raw || '')
      .replace(/<think>[\s\S]*?<\/think>\n*/g, '')
      .replace(/<think>[\s\S]*$/, '');
    if (shouldLogRaw('llm_raw')) {
      log.info(`LLM RAW  ${formatMeta({ session: sid, ltm: ltmEnabled })}\n${stripped}`);
    }
    const payload = parseSummaryPayload(stripped);
    const summary = payload.summary
      .replace(/^\s*\*{1,2}[^*\n]{0,20}[：:]\*{0,2}\s*/u, '')
      .trim();
    log.info(`SUMMARY RAW  ${formatMeta({ session: sid, chars: summary.length, scene: payload.scene || undefined, cast: payload.cast.length || undefined, ltm: payload.memoryLines.length, preview: shouldLogRaw('llm_raw') ? previewText(summary) : undefined })}`);
    return { summary, scene: payload.scene, cast: payload.cast, memoryLines: payload.memoryLines };
  } catch (err) {
    log.warn(`SUMMARY FAIL  ${formatMeta({ session: sid, error: err.message })}`);
    return {
      summary: `${userName}：${userMsg.content} / ${characterName}：${asstMsg.content}`.slice(0, 100),
      scene: '',
      cast: [],
      memoryLines: [],
    };
  }
}

function captureTurnSnapshot(sessionId, worldId, characterId, isWriting) {
  if (!worldId) return null;

  const snapshot = captureStateSnapshot(sessionId, worldId, characterId ? [characterId] : []);
  if (!snapshot || !isWriting) return snapshot;

  const nearbyRows = listNearbyBySessionId(sessionId);
  snapshot.nearby = nearbyRows.map((r) => {
    const state = {};
    for (const s of getStateValuesByNearbyId(r.id)) {
      if (s.runtime_value_json != null) state[s.field_key] = s.runtime_value_json;
    }
    return { id: r.id, name: r.name, persona: r.persona, is_saved: r.is_saved, state };
  });
  return snapshot;
}

async function persistTurnRecordSnapshots(record, sessionId, sid, ltmEnabled, memoryLines) {
  // isUpdate 也要追加记忆，重写同一轮时不能丢掉此前已经抽取的条目。
  if (ltmEnabled && memoryLines.length > 0) {
    try {
      await appendMemoryLines(sessionId, memoryLines);
    } catch (err) {
      log.warn(`LTM APPEND FAIL  ${formatMeta({ session: sid, error: err.message })}`);
    }
  }

  if (!record) return;
  // 每轮都回填完整 memory.md，才能把回滚目标精确还原到该轮的长期记忆状态。
  try {
    updateTurnRecordLtmSnapshot(record.id, readMemoryFile(sessionId));
  } catch (err) {
    log.warn(`LTM SNAPSHOT FAIL  ${formatMeta({ session: sid, error: err.message })}`);
  }
  // tables.json 依赖 priority 2 的 table-memory 任务先写入；本任务是 priority 3。
  try {
    updateTurnRecordTableSnapshot(record.id, readTablesRaw(sessionId));
  } catch (err) {
    log.warn(`TABLE SNAPSHOT FAIL  ${formatMeta({ session: sid, error: err.message })}`);
  }
}

/**
 * 对 turn record 的 summary 计算 embedding 并写入向量库
 */
async function embedTurnRecord(turnRecordId, sessionId, worldId) {
  try {
    const vector = await embed(getTurnRecordById(turnRecordId)?.summary ?? '');
    if (!vector) return; // embedding 未配置，静默退出
    upsertEntry(turnRecordId, sessionId, worldId, vector);
    log.info(`EMBED DONE  ${formatMeta({ turnRecordId, session: sessionId.slice(0, 8), worldId: worldId.slice(0, 8) })}`);
  } catch (err) {
    log.warn(`EMBED FAIL  ${formatMeta({ turnRecordId, session: sessionId.slice(0, 8), error: err.message })}`);
  }
}

export const __testables = {
  parseSummaryPayload,
};
