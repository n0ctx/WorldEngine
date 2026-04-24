/**
 * session-state-values.js — 会话级有效状态值查询
 *
 * 将路由层的 SQL 下沉到此处，消除分层破坏（参见 review.md 问题 #5）。
 * 角色状态改用 CROSS JOIN 批量查询，消除 N+1 问题。
 *
 * 对外接口：
 *   getSessionWorldStateValues(sessionId, worldId)      → Array
 *   getSessionPersonaStateValues(sessionId, worldId)    → Array
 *   getSessionCharacterStateValues(sessionId, worldId, characterIds) → Array
 *   getSingleCharacterSessionStateValues(sessionId, characterId, worldId) → Array
 *   getCharacterStateValuesAfterReset(characterId, worldId) → Array
 */

import db from '../index.js';

/**
 * 获取世界级有效状态值（含会话运行时覆盖）
 */
export function getSessionWorldStateValues(sessionId, worldId) {
  return db.prepare(`
    SELECT
      wsf.field_key,
      wsf.label,
      wsf.type,
      wsf.update_mode,
      wsf.sort_order,
      wsf.max_value,
      wsv.default_value_json,
      swsv.runtime_value_json,
      COALESCE(swsv.runtime_value_json, wsv.default_value_json, wsf.default_value) AS effective_value_json
    FROM world_state_fields wsf
    LEFT JOIN session_world_state_values swsv
      ON swsv.world_id = wsf.world_id AND swsv.field_key = wsf.field_key AND swsv.session_id = ?
    LEFT JOIN world_state_values wsv
      ON wsf.world_id = wsv.world_id AND wsf.field_key = wsv.field_key
    WHERE wsf.world_id = ?
    ORDER BY wsf.sort_order ASC
  `).all(sessionId, worldId);
}

/**
 * 获取玩家级有效状态值（含会话运行时覆盖）
 */
export function getSessionPersonaStateValues(sessionId, worldId) {
  return db.prepare(`
    SELECT
      psf.field_key,
      psf.label,
      psf.type,
      psf.update_mode,
      psf.sort_order,
      psf.max_value,
      psv.default_value_json,
      spsv.runtime_value_json,
      COALESCE(spsv.runtime_value_json, psv.default_value_json, psf.default_value) AS effective_value_json
    FROM persona_state_fields psf
    LEFT JOIN session_persona_state_values spsv
      ON spsv.world_id = psf.world_id AND spsv.field_key = psf.field_key AND spsv.session_id = ?
    LEFT JOIN persona_state_values psv
      ON psf.world_id = psv.world_id AND psf.field_key = psv.field_key
    WHERE psf.world_id = ?
    ORDER BY psf.sort_order ASC
  `).all(sessionId, worldId);
}

/**
 * 批量获取多角色的有效状态值（含会话运行时覆盖）
 *
 * 用 CROSS JOIN 替代路由层的 characterIds 循环，消除 N+1 问题。
 * 结果已扁平化（同原始行为），field_key 可能在不同角色重复出现。
 *
 * @param {string[]} characterIds
 */
export function getSessionCharacterStateValues(sessionId, worldId, characterIds) {
  if (characterIds.length === 0) return [];

  const placeholders = characterIds.map(() => '?').join(', ');
  // CROSS JOIN characters + character_state_fields，按角色 × 字段展开
  // scsv / csv 两张表均按 character_id 绑定，保证每行是特定角色的值
  return db.prepare(`
    SELECT
      csf.field_key,
      csf.label,
      csf.type,
      csf.update_mode,
      csf.sort_order,
      csf.max_value,
      c.id AS character_id,
      csv.default_value_json,
      scsv.runtime_value_json,
      COALESCE(scsv.runtime_value_json, csv.default_value_json, csf.default_value) AS effective_value_json
    FROM characters c
    CROSS JOIN character_state_fields csf ON csf.world_id = c.world_id
    LEFT JOIN session_character_state_values scsv
      ON scsv.character_id = c.id AND scsv.field_key = csf.field_key AND scsv.session_id = ?
    LEFT JOIN character_state_values csv
      ON csv.character_id = c.id AND csv.field_key = csf.field_key
    WHERE c.id IN (${placeholders}) AND csf.world_id = ?
    ORDER BY csf.sort_order ASC
  `).all(sessionId, ...characterIds, worldId);
}

/**
 * 获取单角色的有效状态值（含会话运行时覆盖）
 */
export function getSingleCharacterSessionStateValues(sessionId, characterId, worldId) {
  return db.prepare(`
    SELECT
      csf.field_key,
      csf.label,
      csf.type,
      csf.update_mode,
      csf.sort_order,
      csf.max_value,
      csv.default_value_json,
      scsv.runtime_value_json,
      COALESCE(scsv.runtime_value_json, csv.default_value_json, csf.default_value) AS effective_value_json
    FROM character_state_fields csf
    LEFT JOIN session_character_state_values scsv
      ON scsv.character_id = ? AND scsv.field_key = csf.field_key AND scsv.session_id = ?
    LEFT JOIN character_state_values csv
      ON csf.field_key = csv.field_key AND csv.character_id = ?
    WHERE csf.world_id = ?
    ORDER BY csf.sort_order ASC
  `).all(characterId, sessionId, characterId, worldId);
}

/**
 * 重置单角色会话运行时状态后，返回合并后的状态值（runtime 已清空）
 * 注意：调用方负责 DELETE session_character_state_values，此函数仅查询
 */
export function getCharacterStateValuesAfterReset(characterId, worldId) {
  return db.prepare(`
    SELECT
      csf.field_key,
      csf.label,
      csf.type,
      csf.update_mode,
      csf.sort_order,
      csf.max_value,
      csv.default_value_json,
      NULL AS runtime_value_json,
      COALESCE(csv.default_value_json, csf.default_value) AS effective_value_json
    FROM character_state_fields csf
    LEFT JOIN character_state_values csv
      ON csf.field_key = csv.field_key AND csv.character_id = ?
    WHERE csf.world_id = ?
    ORDER BY csf.sort_order ASC
  `).all(characterId, worldId);
}
