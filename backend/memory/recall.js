/**
 * recall.js — 记忆召回：将结构化状态渲染为可读文本，注入 assembler.js [6] 位置
 *
 * 对外暴露：
 *   renderPersonaState(worldId, sessionId)        → string
 *   renderWorldState(worldId, sessionId)          → string
 *   renderCharacterState(characterId, sessionId)  → string
 */

import { getCharacterById } from '../db/queries/characters.js';
import {
  getCharacterStateDisplayRows,
  getPersonaStateDisplayRows,
  getWorldStateDisplayRows,
  resolveSessionPersonaId,
} from '../db/queries/session-state-values.js';

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

