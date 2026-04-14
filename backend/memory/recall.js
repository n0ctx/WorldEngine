/**
 * recall.js — 记忆召回：将结构化状态渲染为可读文本，注入 assembler.js [6] 位置
 *
 * 对外暴露：
 *   renderPersonaState(worldId)        → string
 *   renderWorldState(worldId)          → string
 *   renderCharacterState(characterId)  → string
 *   renderTimeline(worldId, limit)     → string
 *
 * 未来扩展：embedding 搜索历史 session summary，渐进式展开原文
 */

import db from '../db/index.js';
import { getCharacterById } from '../db/queries/characters.js';
import { WORLD_TIMELINE_RECENT_LIMIT } from '../utils/constants.js';

/**
 * 将 value_json 解析为可显示的字符串。
 * null 返回 null（调用方跳过该行）。
 */
function parseValueForDisplay(valueJson) {
  if (valueJson === null || valueJson === undefined) return null;
  try {
    const parsed = JSON.parse(valueJson);
    if (parsed === null || parsed === undefined) return null;
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
    SELECT psf.label, psv.value_json
    FROM persona_state_fields psf
    LEFT JOIN persona_state_values psv
      ON psf.world_id = psv.world_id AND psf.field_key = psv.field_key
    WHERE psf.world_id = ?
    ORDER BY psf.sort_order ASC, psf.created_at ASC
  `).all(worldId);

  if (rows.length === 0) return '';

  const lines = ['[玩家状态]'];
  for (const row of rows) {
    const value = parseValueForDisplay(row.value_json);
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
    SELECT wsf.label, wsv.value_json
    FROM world_state_fields wsf
    LEFT JOIN world_state_values wsv
      ON wsf.world_id = wsv.world_id AND wsf.field_key = wsv.field_key
    WHERE wsf.world_id = ?
    ORDER BY wsf.sort_order ASC, wsf.created_at ASC
  `).all(worldId);

  if (rows.length === 0) return '';

  const lines = ['[世界状态]'];
  for (const row of rows) {
    const value = parseValueForDisplay(row.value_json);
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
    SELECT csf.label, csv.value_json
    FROM character_state_fields csf
    LEFT JOIN character_state_values csv
      ON csf.field_key = csv.field_key AND csv.character_id = ?
    WHERE csf.world_id = ?
    ORDER BY csf.sort_order ASC, csf.created_at ASC
  `).all(characterId, character.world_id);

  if (rows.length === 0) return '';

  const lines = ['[角色状态]'];
  for (const row of rows) {
    const value = parseValueForDisplay(row.value_json);
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
    SELECT content, is_compressed
    FROM world_timeline
    WHERE world_id = ?
    ORDER BY seq DESC
    LIMIT ?
  `).all(worldId, limit);

  if (rows.length === 0) return '';

  // 按取出顺序逆转，恢复正序展示
  rows.reverse();

  const lines = ['[世界时间线]'];
  for (const row of rows) {
    if (row.is_compressed) {
      lines.push(`- 【早期历史】${row.content}`);
    } else {
      lines.push(`- ${row.content}`);
    }
  }

  return lines.join('\n');
}
