/**
 * world-timeline.js — 对话后异步追加世界时间线
 *
 * 调用方：异步队列，优先级 4（可丢弃）。
 * 读取 session summary，通过 LLM 提取事件列表，写入 world_timeline 表。
 * 总条数超过 WORLD_TIMELINE_MAX_ENTRIES 时触发压缩。
 */

import * as llm from '../llm/index.js';
import { getSessionById } from '../services/sessions.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getWorldById } from '../db/queries/worlds.js';
import { getSummaryBySessionId } from '../db/queries/session-summaries.js';
import {
  insertTimelineEntries,
  countTimelineEntries,
  getEarliestEntries,
  compressEarliestEntries,
} from '../db/queries/world-timeline.js';
import {
  WORLD_TIMELINE_MAX_ENTRIES,
  WORLD_TIMELINE_COMPRESS_THRESHOLD,
} from '../utils/constants.js';

/**
 * 从 session summary 中提取世界事件，追加到时间线。
 *
 * @param {string} sessionId
 */
export async function appendWorldTimeline(sessionId) {
  // 获取 session → character → world
  const session = getSessionById(sessionId);
  if (!session?.character_id) return;

  const character = getCharacterById(session.character_id);
  if (!character?.world_id) return;

  const worldId = character.world_id;
  const world = getWorldById(worldId);
  if (!world) return;

  // 读取本次 session summary
  const summaryRow = getSummaryBySessionId(sessionId);
  if (!summaryRow?.content) return;

  // 调用 LLM 提取事件列表
  const prompt = [
    {
      role: 'user',
      content:
        `你是世界编年史记录员，负责从对话摘要中提取对世界"${world.name}"产生实际影响的重要事件。\n\n` +
        `对话摘要：\n${summaryRow.content}\n\n` +
        `要求：\n` +
        `1. 只提取对世界产生实际影响的事件（战争、外交、灾难、重要发现、政权变更等）\n` +
        `2. 角色间的日常对话、OOC 讨论、不影响世界的个人行为不记录\n` +
        `3. 每条事件简洁描述，不超过 50 字\n` +
        `4. 返回 JSON 数组，无事件则返回空数组 []\n` +
        `5. 不要添加任何解释，只返回 JSON\n\n` +
        `示例：["王国军队击败了北方蛮族入侵", "发现了古代遗迹，内有失落文明的记载"]`,
    },
  ];

  const raw = await llm.complete(prompt, { temperature: 0.3, maxTokens: 500 });
  if (!raw) return;

  // 解析 LLM 返回的 JSON 数组
  let events;
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return;
    events = JSON.parse(match[0]);
  } catch {
    return;
  }

  if (!Array.isArray(events) || events.length === 0) return;

  // 过滤非字符串和空字符串
  const validEvents = events.filter((e) => typeof e === 'string' && e.trim().length > 0);
  if (validEvents.length === 0) return;

  // 插入时间线
  insertTimelineEntries(worldId, validEvents);

  // 检查是否需要压缩
  const total = countTimelineEntries(worldId);
  if (total <= WORLD_TIMELINE_MAX_ENTRIES) return;

  // 触发压缩：取最早的 WORLD_TIMELINE_COMPRESS_THRESHOLD 条
  const toCompress = getEarliestEntries(worldId, WORLD_TIMELINE_COMPRESS_THRESHOLD);
  if (toCompress.length === 0) return;

  const oldEvents = toCompress.map((e) => e.content).join('\n');

  const compressPrompt = [
    {
      role: 'user',
      content:
        `你是世界编年史记录员，请将以下世界"${world.name}"的时间线条目压缩为一段简洁的历史摘要。\n\n` +
        `待压缩条目：\n${oldEvents}\n\n` +
        `要求：\n` +
        `1. 保留所有重要事件的核心信息\n` +
        `2. 合并相关联的事件\n` +
        `3. 摘要不超过 200 字\n` +
        `4. 直接返回摘要文本，不要添加任何标题或解释`,
    },
  ];

  const compressSummary = await llm.complete(compressPrompt, { temperature: 0.3, maxTokens: 300 });
  if (!compressSummary) return;

  compressEarliestEntries(worldId, toCompress.length, compressSummary.trim());
}
