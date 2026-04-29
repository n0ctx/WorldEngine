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
import { upsertTurnRecord, countTurnRecords, getLatestTurnRecord, getTurnRecordById } from '../db/queries/turn-records.js';
import { getWritingSessionCharacters } from '../db/queries/writing-sessions.js';
import { embed } from '../llm/embedding.js';
import { upsertEntry } from '../utils/turn-summary-vector-store.js';
import { createLogger, formatMeta, previewText, shouldLogRaw } from '../utils/logger.js';
import { ALL_MESSAGES_LIMIT, LLM_TASK_TEMPERATURE, LLM_TURN_SUMMARY_MAX_TOKENS } from '../utils/constants.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { getOrCreatePersona } from '../services/personas.js';
import { captureStateSnapshot } from './state-rollback.js';
import { resolveAuxScope } from '../utils/aux-scope.js';

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

  const session = getSessionById(sessionId);
  if (!session) { log.warn(`session not found  session=${sid}`); return; }

  const character = session.character_id ? getCharacterById(session.character_id) : null;
  const worldId = character?.world_id ?? session.world_id;
  const persona = worldId ? getOrCreatePersona(worldId) : null;
  const userName = persona?.name?.trim() || '玩家';
  const characterName = character?.name?.trim() || '角色';

  const allMsgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const round_index = isUpdate
    ? (getLatestTurnRecord(sessionId)?.round_index ?? 1)
    : countTurnRecords(sessionId) + 1;
  const { userMsg, asstMsg } = getRoundMessagePair(allMsgs, round_index);

  if (!userMsg || !asstMsg) {
    log.info(`SKIP  ${formatMeta({ session: sid, round: round_index, reason: 'missing-round-pair' })}`);
    return;
  }

  // LLM 生成摘要（非流式，temp=0.3）
  let summary = '';
  try {
    const prompt = [{
      role: 'user',
      content: renderBackendPrompt('memory-turn-summary.md', {
        USER_NAME: userName,
        CHARACTER_NAME: characterName,
        USER_MESSAGE: userMsg.content,
        ASSISTANT_MESSAGE: asstMsg.content,
      }),
    }];
    const raw = await llm.complete(prompt, { temperature: LLM_TASK_TEMPERATURE, maxTokens: LLM_TURN_SUMMARY_MAX_TOKENS, thinking_level: null, configScope: resolveAuxScope(sessionId), callType: 'turn_summary', conversationId: sessionId });
    // 剥除 <think>...</think> 推理链，再清理标题前缀（如 **摘要：** ）
    summary = (raw || '')
      .replace(/<think>[\s\S]*?<\/think>\n*/g, '')
      .replace(/<think>[\s\S]*$/, '')
      .replace(/^\s*\*{1,2}[^*\n]{0,20}[：:]\*{0,2}\s*/u, '')
      .trim();
    log.info(`SUMMARY RAW  ${formatMeta({ session: sid, chars: summary.length, preview: shouldLogRaw('llm_raw') ? previewText(summary) : undefined })}`);
  } catch (err) {
    log.warn(`SUMMARY FAIL  ${formatMeta({ session: sid, error: err.message })}`);
    // 降级：用前 100 字作为摘要
    summary = `${userName}：${userMsg.content} / ${characterName}：${asstMsg.content}`.slice(0, 100);
  }

  if (!summary) {
    log.warn(`SKIP  ${formatMeta({ session: sid, reason: 'empty-summary' })}`);
    return;
  }

  // 捕获当前三层状态快照（优先级 2 状态更新已完成，此处拿到的是本轮最终状态）
  let characterIds = session.character_id ? [session.character_id] : [];
  if (!session.character_id && session.mode === 'writing' && worldId) {
    characterIds = getWritingSessionCharacters(sessionId).map((c) => c.id);
  }
  const snapshot = worldId ? captureStateSnapshot(sessionId, worldId, characterIds) : null;

  // 写入 DB（upsert by session_id + round_index），存指针而非内容副本
  const record = upsertTurnRecord({
    session_id: sessionId,
    round_index,
    summary,
    user_message_id: userMsg.id,
    asst_message_id: asstMsg.id,
    state_snapshot: snapshot ? JSON.stringify(snapshot) : null,
  });

  log.info(`DONE  ${formatMeta({ session: sid, round: round_index, len: summary.length, recordId: record?.id ?? null })}`);

  // 异步触发 embedding（不阻塞）
  if (record && worldId) {
    embedTurnRecord(record.id, sessionId, worldId).catch(err => log.warn('embed turn record 失败:', err.message));
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
