/**
 * recall.js — 记忆召回：将结构化状态渲染为可读文本，注入 assembler.js [6] 位置
 *
 * 对外暴露：
 *   renderPersonaState(worldId, sessionId)                 → string
 *   renderWorldState(worldId, sessionId)                   → string
 *   renderCharacterState(characterId, sessionId)           → string
 *   renderTransientNearby(rows, fields)                    → string（is_saved=0 完整块）
 *   renderSavedNearbyIndex(rows)                           → string（is_saved=1 仅 name+persona）
 *   renderRecalledSavedNearby(savedRows, fields, hitIds)   → string（preflight 命中后注入完整块）
 *   searchRecalledSummaries(worldId, sessionId)            → Promise<{ recalled: Array, recentMessagesText: string }>
 *     recalled 元素：{ ref, session_id, session_title, created_at, content, score }
 *   renderRecalledSummaries(recalled)                      → string（接受结构化列表，返回注入文本）
 */

import { getCharacterById } from '../db/queries/characters.js';
import { getRecentTurnRecordIds, getTurnRecordsWithSessionByIds } from '../db/queries/turn-records.js';
import {
  getCharacterStateDisplayRows,
  getPersonaStateDisplayRows,
  getWorldStateDisplayRows,
  resolveSessionPersonaId,
} from '../db/queries/session-state-values.js';
import { getLastTurnMessages } from '../db/queries/messages.js';
import { getStateValuesByNearbyId } from '../db/queries/session-nearby-character-state-values.js';
import { applyTemplateVars } from '../utils/template-vars.js';
import { embed } from '../llm/embedding.js';
import { search } from '../utils/turn-summary-vector-store.js';
import { countTokens } from '../utils/token-counter.js';
import { getConfig } from '../services/config.js';
import {
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
    if (typeof parsed === 'object') {
      const entries = Object.entries(parsed);
      if (entries.length === 0) return null;
      return entries.map(([k, v]) => `${k}=${v}`).join('，');
    }
    return String(parsed);
  } catch {
    return String(valueJson);
  }
}

/**
 * 将 rows（含 label / effective_value_json）渲染为状态文本（无标题行，由调用方 XML 包裹）。
 * 无行或全为 null 值时返回空字符串。
 */
function rowsToStateText(rows) {
  if (rows.length === 0) return '';
  const lines = [];
  for (const row of rows) {
    const value = parseValueForDisplay(row.effective_value_json);
    if (value === null) continue;
    const suffix = row.type === 'number' && row.unit ? ` ${row.unit}` : '';
    lines.push(`- ${row.label}：${value}${suffix}`);
  }
  if (lines.length === 0) return '';
  return lines.join('\n');
}

export const __testables = {
  parseValueForDisplay,
  rowsToStateText,
};

/**
 * 渲染玩家状态为可读文本。
 * 优先级：会话 runtime > 全局 default_value_json > 字段 default_value
 *
 * @param {string} worldId
 * @param {string} [sessionId]  — 传入时使用会话级运行时值
 * @returns {string} 渲染结果，无状态字段时返回空字符串
 */
export function renderPersonaState(worldId, sessionId) {
  const personaId = resolveSessionPersonaId(sessionId, worldId);

  const rows = getPersonaStateDisplayRows(personaId, worldId, sessionId);

  return rowsToStateText(rows);
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
  const rows = getWorldStateDisplayRows(worldId, sessionId);

  return rowsToStateText(rows);
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

  const rows = getCharacterStateDisplayRows(characterId, character.world_id, sessionId);

  return rowsToStateText(rows);
}

/**
 * 渲染单个 nearby 角色为可读块：
 *   【name】
 *   底层人设：<persona>         （persona 为空时省略此行）
 *   - 字段label：值              （fields 为空时省略）
 *
 * @param {object} nearby
 * @param {object[]} [fields]  已过滤的 nearby_enabled=1 字段集；为空数组则不渲染 state 行
 * @returns {string}
 */
function renderNearbyBlock(nearby, fields = []) {
  const lines = [`【${nearby.name}】`];
  if (nearby.persona && nearby.persona.trim()) {
    // 写作模式没有"主角色"概念，调用方传入的 char 默认是叙述者占位；
    // nearby 的 persona 文本里 {{char}} 应指代该 nearby 自己（与角色卡同义），
    // 这里先按"该角色名"展开，避免上层 tv(nearbyText) 把所有 {{char}} 统一替换成叙述者。
    const personaText = applyTemplateVars(nearby.persona.trim(), { char: nearby.name });
    lines.push(`底层人设：${personaText}`);
  }
  if (fields.length > 0) {
    const values = getStateValuesByNearbyId(nearby.id);
    const valueMap = new Map(values.map((v) => [v.field_key, v.runtime_value_json]));
    const stateRows = fields.map((f) => ({
      label: f.label,
      type: f.type,
      unit: f.unit,
      effective_value_json: valueMap.get(f.field_key) ?? null,
    }));
    const stateText = rowsToStateText(stateRows);
    if (stateText) lines.push(stateText);
  }
  return lines.join('\n');
}

/**
 * 渲染写作模式 transient（is_saved=0）附近角色的完整块（name + 底层人设 + state）。
 * rows 与 fields 由调用方一次性拉取后传入，避免每轮重复查询。
 *
 * @param {object[]} rows    已过滤的 is_saved=0 行
 * @param {object[]} fields  已过滤的 nearby_enabled=1 字段集
 * @returns {string} 无 transient 时返回空字符串
 */
export function renderTransientNearby(rows, fields) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  return rows.map((nearby) => renderNearbyBlock(nearby, fields)).join('\n\n');
}

/**
 * 渲染写作模式 saved（is_saved=1）附近角色的"索引"块：仅 name + 底层人设，不含 state。
 * 用作每轮固定线索清单 + preflight 召回判定输入。
 *
 * @param {object[]} rows  已过滤的 is_saved=1 行
 * @returns {string} 无 saved 时返回空字符串
 */
export function renderSavedNearbyIndex(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  return rows.map((nearby) => renderNearbyBlock(nearby)).join('\n\n');
}

/**
 * 渲染 preflight 命中的 saved 角色的完整块（含 state），供 [10.5] `<recalled_characters>` 注入。
 *
 * @param {object[]} savedRows  已过滤的 is_saved=1 行
 * @param {object[]} fields     已过滤的 nearby_enabled=1 字段集
 * @param {string[]} hitIds     saved 角色 id 列表（顺序保留命中顺序）
 * @returns {string} 无命中时返回空字符串
 */
export function renderRecalledSavedNearby(savedRows, fields, hitIds) {
  if (!Array.isArray(savedRows) || savedRows.length === 0) return '';
  if (!Array.isArray(hitIds) || hitIds.length === 0) return '';

  const hitSet = new Set(hitIds);
  const byId = new Map(savedRows.filter((r) => hitSet.has(r.id)).map((r) => [r.id, r]));
  const ordered = hitIds.map((id) => byId.get(id)).filter(Boolean);
  if (ordered.length === 0) return '';

  return ordered.map((nearby) => renderNearbyBlock(nearby, fields)).join('\n\n');
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
  const lastTurn = getLastTurnMessages(sessionId);
  const lastUser = lastTurn.find((m) => m.role === 'user');
  const lastAsst = lastTurn.find((m) => m.role === 'assistant');

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

  // 向量搜索（当前世界内跨会话，取 topK；从 config 读取，未配置时回退常量）
  const cfgRecall = Number(getConfig().memory_recall_max_sessions);
  const topK = Number.isFinite(cfgRecall) && cfgRecall > 0 ? Math.floor(cfgRecall) : MEMORY_RECALL_MAX_SESSIONS;
  const hits = search(queryVector, {
    worldId,
    currentSessionId: sessionId,
    topK,
    sessionOnly: true,
  });

  if (hits.length === 0) return { recalled: [], recentMessagesText };

  // 排除已在上下文窗口内的轮次（[14] history），避免同一内容三重注入导致输出锚定
  const config = getConfig();
  const contextWindow = config.context_history_rounds ?? 12;
  const recentIds = new Set(getRecentTurnRecordIds(sessionId, contextWindow));

  // 拉取 turn record 元信息，按 token 预算软截断，构建结构化列表
  const recalled = [];
  let totalTokens = 0;
  let ref = 1;

  const records = getTurnRecordsWithSessionByIds(hits.map((hit) => hit.turn_record_id));
  for (const hit of hits) {
    if (recentIds.has(hit.turn_record_id)) continue;
    const record = records.get(hit.turn_record_id);
    if (!record?.summary) continue;

    const lineTokens = countTokens(record.summary);
    if (totalTokens + lineTokens > MEMORY_RECALL_MAX_TOKENS) break;

    recalled.push({
      ref,
      turn_record_id: record.id,
      session_id: record.session_id,
      session_title: record.session_title || '未命名会话',
      round_index: record.round_index,
      created_at: record.session_created_at ?? record.created_at,
      content: record.summary,
      scene: record.scene || '',
      cast: parseCastJson(record.cast_json),
      score: hit.score,
      is_same_session: hit.is_same_session,
    });
    totalTokens += lineTokens;
    ref++;
  }

  return { recalled, recentMessagesText };
}

/**
 * 将 turn record 的 cast_json 解析为人物名数组，非法或缺失时返回空数组。
 */
function parseCastJson(castJson) {
  if (!castJson) return [];
  try {
    const parsed = JSON.parse(castJson);
    return Array.isArray(parsed) ? parsed.map((n) => String(n ?? '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * 将结构化召回列表渲染为注入用的可读文本。
 * 每条前加 【#ref】 前缀，供 AI 指代；scene / cast 作为定位锚点紧跟在日期块之后。
 *
 * @param {Array} recalled  searchRecalledSummaries 返回的 recalled 数组
 * @returns {string}  无项时返回空字符串
 */
export function renderRecalledSummaries(recalled) {
  if (!recalled || recalled.length === 0) return '';

  const lines = [];
  for (const item of recalled) {
    const dateStr = new Date(item.created_at).toISOString().slice(0, 10);
    const anchorParts = [item.scene, (item.cast ?? []).join('、')].filter(Boolean);
    const anchor = anchorParts.length > 0 ? `【${anchorParts.join(' · ')}】` : '';
    lines.push(`- 【#${item.ref}】【${dateStr} · ${item.session_title}】${anchor}${item.content}`);
  }

  return lines.join('\n');
}
