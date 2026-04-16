/**
 * context-compressor.js — 手动 /summary 触发：基于最近 K 轮 turn records + 召回摘要
 * 生成 100-200 字世界时间线条目，upsert 到 world_timeline。
 *
 * 对外暴露：
 *   generateTimelineEntry(sessionId)
 */

import { getConfig } from '../services/config.js';
import { getSessionById } from '../db/queries/sessions.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getAllTurnRecordsBySessionId } from '../db/queries/turn-records.js';
import { searchRecalledSummaries, renderRecalledSummaries } from './recall.js';
import { upsertSessionTimeline } from '../db/queries/world-timeline.js';
import * as llm from '../llm/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('timeline');

/**
 * 手动触发：取当前 session 最近 K 轮 turn records（原文）+ 召回摘要，
 * 交 LLM 生成 100-200 字世界时间线条目，upsert 到 world_timeline。
 *
 * @param {string} sessionId
 */
export async function generateTimelineEntry(sessionId) {
  const sid = sessionId.slice(0, 8);
  log.debug(`START  session=${sid}`);

  const session = getSessionById(sessionId);
  if (!session) { log.warn(`session not found  session=${sid}`); return; }

  const character = session.character_id ? getCharacterById(session.character_id) : null;
  const worldId = character?.world_id ?? session.world_id;
  if (!worldId) { log.warn(`no worldId  session=${sid}`); return; }

  const config = getConfig();
  const K = config.context_history_rounds ?? 10;

  // 取当前 session 所有 turn records（不超过 K 条）
  const allRecords = getAllTurnRecordsBySessionId(sessionId);
  const records = allRecords.slice(-K);

  if (records.length === 0) {
    log.debug(`SKIP no turn records  session=${sid}`);
    return;
  }

  // 构建上文文本：K 轮 turn records 的 original_text
  const contextLines = records.map((r) => {
    return `【第${r.round_index}轮】\n${r.user_context}\n\n${r.asst_context}`;
  });
  const contextText = contextLines.join('\n\n---\n\n');

  // 召回摘要（同世界历史 turn summaries，不展开）
  const { recalled } = await searchRecalledSummaries(worldId, sessionId);
  const recalledText = renderRecalledSummaries(recalled);

  // 组装 LLM 输入
  const inputParts = [contextText, recalledText].filter(Boolean);
  const inputText = inputParts.join('\n\n');

  if (!inputText) {
    log.debug(`SKIP empty input  session=${sid}`);
    return;
  }

  // LLM 生成 100-200 字时间线条目
  let timelineContent = '';
  try {
    const prompt = [{
      role: 'user',
      content:
        `请根据以下对话内容，生成一段 100~200 字的世界时间线记录。` +
        `要求：简洁描述发生的关键事件，包含重要人物、地点、时间线变化，` +
        `以第三人称叙事风格写作，不加任何标题或格式标记。\n\n${inputText}`,
    }];
    const raw = await llm.complete(prompt, { temperature: 0.3, maxTokens: 500 });
    timelineContent = raw?.trim() ?? '';
  } catch (err) {
    log.warn(`LLM timeline failed  session=${sid}  err=${err.message}`);
    return;
  }

  if (!timelineContent) {
    log.warn(`empty timeline content  session=${sid}`);
    return;
  }

  // Upsert 世界时间线（per-session 覆盖，按触发时间排序）
  upsertSessionTimeline(worldId, sessionId, timelineContent);
  log.info(`DONE  session=${sid}  world=${worldId.slice(0, 8)}  len=${timelineContent.length}`);
}
