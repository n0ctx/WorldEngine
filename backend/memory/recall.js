/**
 * recall.js — 记忆召回：将结构化状态渲染为可读文本，注入 assembler.js [6] 位置
 *
 * 对外暴露：
 *   renderPersonaState(worldId)                            → string
 *   renderWorldState(worldId)                              → string
 *   renderCharacterState(characterId)                      → string
 *   renderTimeline(worldId, limit)                         → string
 *   searchRecalledSummaries(worldId, sessionId)            → Promise<{ recalled: Array, recentMessagesText: string }>
 *     recalled 元素：{ ref, session_id, session_title, created_at, content, score }
 *   renderRecalledSummaries(recalled)                      → string（接受结构化列表，返回注入文本）
 */

import db from '../db/index.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getTurnRecordById } from '../db/queries/turn-records.js';
import { embed } from '../llm/embedding.js';
import { search } from '../utils/turn-summary-vector-store.js';
import { countTokens } from '../utils/token-counter.js';
import {
  WORLD_TIMELINE_RECENT_LIMIT,
  MEMORY_RECALL_MAX_SESSIONS,
  MEMORY_RECALL_MAX_TOKENS,
} from '../utils/constants.js';

/**
 * 将 effective_value_json 解析为可显示的字符串。
 * null 返回 null（调用方跳过该行）。
 */
function parseValueForDisplay(valueJson) {
  if (valueJson === null || valueJson === undefined) return null;
  try {
    const parsed = JSON.parse(valueJson);
    if (parsed === null || parsed === undefined) return null;
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return null;
      return parsed.join('、');
    }
    return String(parsed);
  } catch {
    return String(valueJson);
  }
}

/**
 * 渲染玩家状态为可读文本。
 *
 * @param {string} worldId
 * @returns {string} 渲染结果，无状态字段时返回空字符串
 */
export function renderPersonaState(worldId) {
  const rows = db.prepare(`
    SELECT
      psf.label,
      CASE
        WHEN psv.runtime_value_json IS NOT NULL THEN psv.runtime_value_json
        WHEN psv.id IS NOT NULL THEN psv.default_value_json
        ELSE psf.default_value
      END AS effective_value_json
    FROM persona_state_fields psf
    LEFT JOIN persona_state_values psv
      ON psf.world_id = psv.world_id AND psf.field_key = psv.field_key
    WHERE psf.world_id = ?
    ORDER BY psf.sort_order ASC, psf.created_at ASC
  `).all(worldId);

  if (rows.length === 0) return '';

  const lines = ['[{{user}}状态]'];
  for (const row of rows) {
    const value = parseValueForDisplay(row.effective_value_json);
    if (value !== null) {
      lines.push(`- ${row.label}：${value}`);
    }
  }

  if (lines.length === 1) return '';
  return lines.join('\n');
}

/**
 * 渲染世界状态为可读文本。
 *
 * @param {string} worldId
 * @returns {string} 渲染结果，无状态字段时返回空字符串
 */
export function renderWorldState(worldId) {
  const rows = db.prepare(`
    SELECT
      wsf.label,
      CASE
        WHEN wsv.runtime_value_json IS NOT NULL THEN wsv.runtime_value_json
        WHEN wsv.id IS NOT NULL THEN wsv.default_value_json
        ELSE wsf.default_value
      END AS effective_value_json
    FROM world_state_fields wsf
    LEFT JOIN world_state_values wsv
      ON wsf.world_id = wsv.world_id AND wsf.field_key = wsv.field_key
    WHERE wsf.world_id = ?
    ORDER BY wsf.sort_order ASC, wsf.created_at ASC
  `).all(worldId);

  if (rows.length === 0) return '';

  const lines = ['[{{world}}状态]'];
  for (const row of rows) {
    const value = parseValueForDisplay(row.effective_value_json);
    if (value !== null) {
      lines.push(`- ${row.label}：${value}`);
    }
  }

  // 若所有字段均无值，返回空字符串
  if (lines.length === 1) return '';
  return lines.join('\n');
}

/**
 * 渲染角色状态为可读文本。
 *
 * @param {string} characterId
 * @returns {string} 渲染结果，无状态字段时返回空字符串
 */
export function renderCharacterState(characterId) {
  const character = getCharacterById(characterId);
  if (!character) return '';

  const rows = db.prepare(`
    SELECT
      csf.label,
      CASE
        WHEN csv.runtime_value_json IS NOT NULL THEN csv.runtime_value_json
        WHEN csv.id IS NOT NULL THEN csv.default_value_json
        ELSE csf.default_value
      END AS effective_value_json
    FROM character_state_fields csf
    LEFT JOIN character_state_values csv
      ON csf.field_key = csv.field_key AND csv.character_id = ?
    WHERE csf.world_id = ?
    ORDER BY csf.sort_order ASC, csf.created_at ASC
  `).all(characterId, character.world_id);

  if (rows.length === 0) return '';

  const lines = ['[{{char}}状态]'];
  for (const row of rows) {
    const value = parseValueForDisplay(row.effective_value_json);
    if (value !== null) {
      lines.push(`- ${row.label}：${value}`);
    }
  }

  if (lines.length === 1) return '';
  return lines.join('\n');
}

/**
 * 渲染世界时间线为可读文本。
 * 取最近 limit 条记录（按 seq 降序取，展示时正序排列）。
 *
 * @param {string} worldId
 * @param {number} [limit] — 默认 WORLD_TIMELINE_RECENT_LIMIT
 * @returns {string} 渲染结果，无记录时返回空字符串
 */
export function renderTimeline(worldId, limit = WORLD_TIMELINE_RECENT_LIMIT) {
  const rows = db.prepare(`
    SELECT wt.content, wt.updated_at, s.title
    FROM world_timeline wt
    LEFT JOIN sessions s ON wt.session_id = s.id
    WHERE wt.world_id = ?
    ORDER BY wt.updated_at DESC
    LIMIT ?
  `).all(worldId, limit);

  if (rows.length === 0) return '';

  const lines = ['[历史会话摘要]'];
  for (const row of rows) {
    const dateStr = new Date(row.updated_at || 0).toISOString().slice(0, 10);
    const title = row.title || '未命名会话';
    lines.push(`- 【${dateStr} · ${title}】${row.content}`);
  }

  return lines.join('\n');
}

/**
 * 基于当前对话最后一轮（最后一条 user + 最后一条 assistant），向量搜索历史 turn summary。
 * 每条元素：{ ref, turn_record_id, session_id, session_title, created_at, content, score, is_same_session }
 * ref 从 1 起，供 AI 通过 #ref 指代。
 *
 * 双阈值策略：同 session 用较低阈值（宽松），跨 session 用较高阈值（严格）。
 *
 * @param {string} worldId
 * @param {string} sessionId   当前 session
 * @returns {Promise<{ recalled: Array, recentMessagesText: string }>}
 */
export async function searchRecalledSummaries(worldId, sessionId) {
  // 查询向量：最后一条 user 消息 + 最后一条 assistant 消息
  const lastUser = db.prepare(`
    SELECT content FROM messages
    WHERE session_id = ? AND role = 'user'
    ORDER BY created_at DESC LIMIT 1
  `).get(sessionId);

  const lastAsst = db.prepare(`
    SELECT content FROM messages
    WHERE session_id = ? AND role = 'assistant'
    ORDER BY created_at DESC LIMIT 1
  `).get(sessionId);

  if (!lastUser) return { recalled: [], recentMessagesText: '' };

  const recentMessagesText = [
    lastUser  ? `用户：${lastUser.content}`  : '',
    lastAsst  ? `AI：${lastAsst.content}`    : '',
  ].filter(Boolean).join('\n');

  // 获取查询向量；embedding 未配置时静默降级
  let queryVector = null;
  try {
    queryVector = await embed(recentMessagesText);
  } catch {
    // embed 失败时降级，不抛出
  }
  if (!queryVector) return { recalled: [], recentMessagesText };

  // 向量搜索（同世界，同 session / 跨 session 双阈值，取 topK）
  const hits = search(queryVector, {
    worldId,
    currentSessionId: sessionId,
    topK: MEMORY_RECALL_MAX_SESSIONS,
  });

  if (hits.length === 0) return { recalled: [], recentMessagesText };

  // 拉取 turn record 元信息，按 token 预算软截断，构建结构化列表
  const recalled = [];
  let totalTokens = 0;
  let ref = 1;

  for (const hit of hits) {
    const record = getTurnRecordById(hit.turn_record_id);
    if (!record?.summary) continue;

    // 通过 session 拿 title 和 created_at
    const sessionRow = db.prepare('SELECT title, created_at FROM sessions WHERE id = ?').get(record.session_id);

    const lineTokens = countTokens(record.summary);
    if (totalTokens + lineTokens > MEMORY_RECALL_MAX_TOKENS) break;

    recalled.push({
      ref,
      turn_record_id: record.id,
      session_id: record.session_id,
      session_title: sessionRow?.title || '未命名会话',
      round_index: record.round_index,
      created_at: sessionRow?.created_at ?? record.created_at,
      content: record.summary,
      score: hit.score,
      is_same_session: hit.is_same_session,
    });
    totalTokens += lineTokens;
    ref++;
  }

  return { recalled, recentMessagesText };
}

/**
 * 将结构化召回列表渲染为注入用的可读文本。
 * 每条前加 【#ref】 前缀，供 AI 指代。
 *
 * @param {Array} recalled  searchRecalledSummaries 返回的 recalled 数组
 * @returns {string}  无项时返回空字符串
 */
export function renderRecalledSummaries(recalled) {
  if (!recalled || recalled.length === 0) return '';

  const lines = ['[历史记忆召回]'];
  for (const item of recalled) {
    const dateStr = new Date(item.created_at).toISOString().slice(0, 10);
    lines.push(`- 【#${item.ref}】【${dateStr} · ${item.session_title}】${item.content}`);
  }

  return lines.join('\n');
}
