import db from '../index.js';
import { upsertStateValue } from './_state-values-base.js';

// default_value_json / runtime_value_json 保持原始 JSON 字符串，调用方按字段 type 自行解析

/**
 * upsert 世界状态值
 * @param {string} worldId
 * @param {string} fieldKey
 * @param {{ defaultValueJson?: string|null, runtimeValueJson?: string|null, touchUpdatedAt?: boolean, skipCreate?: boolean }} patch
 */
export function upsertWorldStateValue(worldId, fieldKey, patch = {}) {
  return upsertStateValue('world_state_values', 'world_id', worldId, fieldKey, patch);
}

/**
 * 获取单个世界状态值
 */
export function getWorldStateValue(worldId, fieldKey) {
  return db.prepare(
    'SELECT * FROM world_state_values WHERE world_id = ? AND field_key = ?',
  ).get(worldId, fieldKey);
}

/**
 * 获取某世界的所有状态值
 */
export function getAllWorldStateValues(worldId) {
  return db.prepare(
    'SELECT * FROM world_state_values WHERE world_id = ? ORDER BY field_key ASC',
  ).all(worldId);
}

/**
 * 删除单个世界状态值（字段删除时调用）
 */
export function deleteWorldStateValue(worldId, fieldKey) {
  return db.prepare(
    'DELETE FROM world_state_values WHERE world_id = ? AND field_key = ?',
  ).run(worldId, fieldKey);
}

/**
 * 联表查询：世界状态字段定义 + 当前值，按 sort_order 升序
 * @param {string} worldId
 * @returns {{ field_key, label, type, sort_order, value_json }[]}
 */
export function getWorldStateValuesWithFields(worldId) {
  return db.prepare(`
    SELECT
      wsf.field_key,
      wsf.label,
      wsf.type,
      wsf.prefix,
      wsf.unit,
      wsf.sort_order,
      wsf.enum_options,
      wsf.table_columns,
      wsf.default_value AS field_default_value,
      wsv.default_value_json AS stored_default_value_json,
      wsv.runtime_value_json,
      CASE
        WHEN wsv.id IS NOT NULL THEN wsv.default_value_json
        ELSE wsf.default_value
      END AS default_value_json,
      CASE
        WHEN wsv.runtime_value_json IS NOT NULL THEN wsv.runtime_value_json
        WHEN wsv.id IS NOT NULL THEN wsv.default_value_json
        ELSE wsf.default_value
      END AS effective_value_json
    FROM world_state_fields wsf
    LEFT JOIN world_state_values wsv
      ON wsf.world_id = wsv.world_id AND wsf.field_key = wsv.field_key
    WHERE wsf.world_id = ?
    ORDER BY wsf.sort_order ASC
  `).all(worldId);
}

/**
 * 清空某世界所有状态字段的运行时值（删除消息回滚状态时调用）
 */
export function clearWorldStateRuntimeValues(worldId) {
  db.prepare('UPDATE world_state_values SET runtime_value_json = NULL WHERE world_id = ?').run(worldId);
}
