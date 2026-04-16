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
import { getWorldById } from '../db/queries/worlds.js';
import { getMessagesBySessionId } from '../db/queries/messages.js';
import { upsertTurnRecord, countTurnRecords, getLatestTurnRecord } from '../db/queries/turn-records.js';
import { getWritingSessionCharacters } from '../db/queries/writing-sessions.js';
import { renderPersonaState, renderWorldState, renderCharacterState } from './recall.js';
import { embed } from '../llm/embedding.js';
import { upsertEntry } from '../utils/turn-summary-vector-store.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('turn-sum');

/**
 * 为当前 session 最近一轮（最后一条 user + 最后一条 assistant）创建 turn record。
 *
 * @param {string} sessionId
 * @param {{ isUpdate?: boolean }} [options]
 *   isUpdate=true 时：覆盖最后一条 turn record（/continue 场景）
 */
export async function createTurnRecord(sessionId, { isUpdate = false } = {}) {
  const sid = sessionId.slice(0, 8);

  const session = getSessionById(sessionId);
  if (!session) { log.warn(`session not found  session=${sid}`); return; }

  const character = session.character_id ? getCharacterById(session.character_id) : null;
  // 写作模式 session.character_id 为 null，直接从 session.world_id 取世界
  const worldId = character?.world_id ?? session.world_id;
  const world = worldId ? getWorldById(worldId) : null;

  // 取全部消息，找最后一条 user + 最后一条 assistant
  const allMsgs = getMessagesBySessionId(sessionId, 9999, 0);
  const userMsg = [...allMsgs].reverse().find((m) => m.role === 'user');
  const asstMsg = [...allMsgs].reverse().find((m) => m.role === 'assistant');

  if (!userMsg || !asstMsg) {
    log.debug(`SKIP no user/assistant pair  session=${sid}`);
    return;
  }

  log.debug(`START  session=${sid}  isUpdate=${isUpdate}`);

  // 渲染状态快照（turn 结束后，捕获本轮更新后的最终状态）
  const worldStateText   = world ? renderWorldState(world.id)   : '';
  const personaStateText = world ? renderPersonaState(world.id) : '';

  // 角色状态：普通模式取单一角色，写作模式取所有激活角色
  let charStateText = '';
  if (character) {
    charStateText = renderCharacterState(character.id);
  } else if (session.mode === 'writing') {
    const activeChars = getWritingSessionCharacters(sessionId);
    charStateText = activeChars.map((c) => renderCharacterState(c.id)).filter(Boolean).join('\n\n');
  }

  // 组装 user_context / asst_context
  const userParts = [worldStateText, personaStateText, `用户：${userMsg.content}`].filter(Boolean);
  const asstParts = [`AI：${asstMsg.content}`, charStateText].filter(Boolean);
  const user_context = userParts.join('\n\n');
  const asst_context = asstParts.join('\n\n');

  // LLM 生成摘要（非流式，temp=0.3）
  let summary = '';
  try {
    const prompt = [{
      role: 'user',
      content:
        `请对以下对话生成简洁摘要（100~200字），概括主要内容、关键事件和结论。` +
        `摘要将用于后续记忆检索，请确保包含重要的人物、地点、事件等关键信息。\n\n` +
        `用户：${userMsg.content}\n\nAI：${asstMsg.content}`,
    }];
    const raw = await llm.complete(prompt, { temperature: 0.3, maxTokens: 500 });
    summary = raw?.trim() ?? '';
  } catch (err) {
    log.warn(`LLM summary failed  session=${sid}  err=${err.message}`);
    // 降级：用前 100 字作为摘要
    summary = `${userMsg.content} / ${asstMsg.content}`.slice(0, 100);
  }

  if (!summary) {
    log.warn(`empty summary, skip  session=${sid}`);
    return;
  }

  // 计算 round_index
  let round_index;
  if (isUpdate) {
    const latest = getLatestTurnRecord(sessionId);
    round_index = latest ? latest.round_index : 1;
  } else {
    round_index = countTurnRecords(sessionId) + 1;
  }

  // 写入 DB（upsert by session_id + round_index）
  const record = upsertTurnRecord({
    session_id: sessionId,
    round_index,
    summary,
    user_context,
    asst_context,
  });

  log.info(`DONE  session=${sid}  round=${round_index}  len=${summary.length}`);

  // 异步触发 embedding（不阻塞）
  if (record && worldId) {
    embedTurnRecord(record.id, sessionId, worldId).catch(() => {});
  }
}

/**
 * 对 turn record 的 summary 计算 embedding 并写入向量库
 */
async function embedTurnRecord(turnRecordId, sessionId, worldId) {
  try {
    const vector = await embed(
      (await import('../db/queries/turn-records.js')).getTurnRecordById(turnRecordId)?.summary ?? '',
    );
    if (!vector) return; // embedding 未配置，静默退出
    upsertEntry(turnRecordId, sessionId, worldId, vector);
  } catch (err) {
    log.warn(`embed failed  turnRecord=${turnRecordId}  err=${err.message}`);
  }
}
