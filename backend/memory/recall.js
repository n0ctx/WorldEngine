/**
 * recall.js — 记忆召回：将结构化状态渲染为可读文本，注入 assembler.js [6] 位置
 *
 * 对外暴露：
 *   renderPersonaState(worldId, sessionId)                 → string
 *   renderWorldState(worldId, sessionId)                   → string
 *   renderCharacterState(characterId, sessionId)           → string
 *   renderTimeline(sessionId, limit)                       → string（当前会话近 N 轮摘要）
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
 * 将 rows（含 label / effective_value_json）渲染为带标题行的状态文本。
 * 无行或全为 null 值时返回空字符串。
 */
function rowsToStateText(rows, header) {
  if (rows.length === 0) return '';
  const lines = [header];
  for (const row of rows) {
    const value = parseValueForDisplay(row.effective_value_json);
    if (value !== null) lines.push(`- ${row.label}：${value}`);
  }
  if (lines.length === 1) return '';
  return lines.join('\n');
}

/**
 * 渲染玩家状态为可读文本。
 * 优先级：会话 runtime > 全局 default_value_json > 字段 default_value
 *
 * @param {string} worldId
 * @param {string} [sessionId]  — 传入时使用会话级运行时值
 * @returns {string} 渲染结果，无状态字段时返回空字符串
 */
export function renderPersonaState(worldId, sessionId) {
  const rows = sessionId
    ? db.prepare(`
        SELECT
          psf.label,
          COALESCE(spsv.runtime_value_json, psv.default_value_json, psf.default_value) AS effective_value_json
        FROM persona_state_fields psf
        LEFT JOIN session_persona_state_values spsv
          ON spsv.world_id = psf.world_id AND spsv.field_key = psf.field_key AND spsv.session_id = ?
        LEFT JOIN persona_state_values psv
          ON psf.world_id = psv.world_id AND psf.field_key = psv.field_key
        WHERE psf.world_id = ?
        ORDER BY psf.sort_order ASC, psf.created_at ASC
      `).all(sessionId, worldId)
    : db.prepare(`
        SELECT
          psf.label,
          COALESCE(psv.runtime_value_json, psv.default_value_json, psf.default_value) AS effective_value_json
        FROM persona_state_fields psf
        LEFT JOIN persona_state_values psv
          ON psf.world_id = psv.world_id AND psf.field_key = psv.field_key
        WHERE psf.world_id = ?
        ORDER BY psf.sort_order ASC, psf.created_at ASC
      `).all(worldId);

  return rowsToStateText(rows, '[{{user}}状态]');
}

/**
 * 渲染世界状态为可读文本。
 * 优先级：会话 runtime > 全局 default_value_json > 字段 default_value
 *
 * @param {string} worldId
 * @param {string} [sessionId]  — 传入时使用会话级运行时值
 * @returns {string} 渲染结果，无状态字段时返回空字符串
 */
export function renderWorldState(worldId, sessionId) {
  const rows = sessionId
    ? db.prepare(`
        SELECT
          wsf.label,
          COALESCE(swsv.runtime_value_json, wsv.default_value_json, wsf.default_value) AS effective_value_json
        FROM world_state_fields wsf
        LEFT JOIN session_world_state_values swsv
          ON swsv.world_id = wsf.world_id AND swsv.field_key = wsf.field_key AND swsv.session_id = ?
        LEFT JOIN world_state_values wsv
          ON wsf.world_id = wsv.world_id AND wsf.field_key = wsv.field_key
        WHERE wsf.world_id = ?
        ORDER BY wsf.sort_order ASC, wsf.created_at ASC
      `).all(sessionId, worldId)
    : db.prepare(`
        SELECT
          wsf.label,
          COALESCE(wsv.runtime_value_json, wsv.default_value_json, wsf.default_value) AS effective_value_json
        FROM world_state_fields wsf
        LEFT JOIN world_state_values wsv
          ON wsf.world_id = wsv.world_id AND wsf.field_key = wsv.field_key
        WHERE wsf.world_id = ?
        ORDER BY wsf.sort_order ASC, wsf.created_at ASC
      `).all(worldId);

  return rowsToStateText(rows, '[{{world}}状态]');
}

/**
 * 渲染角色状态为可读文本。
 * 优先级：会话 runtime > 全局 default_value_json > 字段 default_value
 *
 * @param {string} characterId
 * @param {string} [sessionId]  — 传入时使用会话级运行时值
 * @returns {string} 渲染结果，无状态字段时返回空字符串
 */
export function renderCharacterState(characterId, sessionId) {
  const character = getCharacterById(characterId);
  if (!character) return '';

  const rows = sessionId
    ? db.prepare(`
        SELECT
          csf.label,
          COALESCE(scsv.runtime_value_json, csv.default_value_json, csf.default_value) AS effective_value_json
        FROM character_state_fields csf
        LEFT JOIN session_character_state_values scsv
          ON scsv.character_id = ? AND scsv.field_key = csf.field_key AND scsv.session_id = ?
        LEFT JOIN character_state_values csv
          ON csf.field_key = csv.field_key AND csv.character_id = ?
        WHERE csf.world_id = ?
        ORDER BY csf.sort_order ASC, csf.created_at ASC
      `).all(characterId, sessionId, characterId, character.world_id)
    : db.prepare(`
        SELECT
          csf.label,
          COALESCE(csv.runtime_value_json, csv.default_value_json, csf.default_value) AS effective_value_json
        FROM character_state_fields csf
        LEFT JOIN character_state_values csv
          ON csf.field_key = csv.field_key AND csv.character_id = ?
        WHERE csf.world_id = ?
        ORDER BY csf.sort_order ASC, csf.created_at ASC
      `).all(characterId, character.world_id);

  return rowsToStateText(rows, '[{{char}}状态]');
}

/**
 * 渲染当前会话近 limit 轮摘要为可读文本（注入提示词 [11] 位置）。
 * 取该 session 最近 N 条 turn_records，按 round_index 升序排列。
 *
 * @param {string} sessionId
 * @param {number} [limit] — 默认 WORLD_TIMELINE_RECENT_LIMIT
 * @returns {string} 渲染结果，无记录时返回空字符串
 */
export function renderTimeline(sessionId, limit = WORLD_TIMELINE_RECENT_LIMIT) {
  const rows = db.prepare(`
    SELECT round_index, summary FROM (
      SELECT round_index, summary FROM turn_records
      WHERE session_id = ?
      ORDER BY round_index DESC LIMIT ?
    ) ORDER BY round_index ASC
  `).all(sessionId, limit);

  if (rows.length === 0) return '';

  const lines = ['[当前会话摘要]'];
  for (const row of rows) {
    lines.push(`- [第${row.round_index}轮] ${row.summary}`);
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

  // 向量搜索（仅限当前 session，取 topK）
  const hits = search(queryVector, {
    worldId,
    currentSessionId: sessionId,
    topK: MEMORY_RECALL_MAX_SESSIONS,
    sessionOnly: true,
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
