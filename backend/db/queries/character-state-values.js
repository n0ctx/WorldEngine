import crypto from 'node:crypto';
import db from '../index.js';
import { upsertStateValue } from './_state-values-base.js';

// default_value_json / runtime_value_json 保持原始 JSON 字符串，调用方按字段 type 自行解析

/**
 * upsert 角色状态值
 * @param {string} characterId
 * @param {string} fieldKey
 * @param {{ defaultValueJson?: string|null, runtimeValueJson?: string|null, touchUpdatedAt?: boolean, skipCreate?: boolean }} patch
 */
export function upsertCharacterStateValue(characterId, fieldKey, patch = {}) {
  return upsertStateValue('character_state_values', 'character_id', characterId, fieldKey, patch);
}

/**
 * 批量 upsert 角色默认状态值。复用单条预编译语句，并在同一事务内写入。
 * @param {{ characterId: string, fieldKey: string, defaultValueJson: string|null }[]} values
 */
export function upsertCharacterStateValues(values) {
  if (values.length === 0) return;
  const upsert = db.prepare(`
    INSERT INTO character_state_values
      (id, character_id, field_key, default_value_json, runtime_value_json, updated_at)
    VALUES (?, ?, ?, ?, NULL, 0)
    ON CONFLICT(character_id, field_key)
    DO UPDATE SET default_value_json = excluded.default_value_json
  `);
  db.transaction((entries) => {
    for (const { characterId, fieldKey, defaultValueJson } of entries) {
      upsert.run(crypto.randomUUID(), characterId, fieldKey, defaultValueJson);
    }
  })(values);
}

/** 删除某世界所有角色的指定状态值。 */
export function deleteCharacterStateValuesByWorldIdAndFieldKey(worldId, fieldKey) {
  return db.prepare(`
    DELETE FROM character_state_values
    WHERE field_key = ?
      AND character_id IN (SELECT id FROM characters WHERE world_id = ?)
  `).run(fieldKey, worldId);
}

/**
 * 获取某角色的所有状态值
 */
export function getAllCharacterStateValues(characterId) {
  return db.prepare(
    'SELECT * FROM character_state_values WHERE character_id = ? ORDER BY field_key ASC',
  ).all(characterId);
}

/**
 * 一次取出多个角色的状态值，返回 { character_id → 行数组 }；每组内按 field_key 排序，
 * 没有任何值的角色也会得到空数组。
 * @param {string[]} characterIds
 */
export function getCharacterStateValuesByCharacterIds(characterIds) {
  const result = Object.fromEntries(characterIds.map((id) => [id, []]));
  if (characterIds.length === 0) return result;
  const placeholders = characterIds.map(() => '?').join(', ');
  const rows = db.prepare(
    `SELECT * FROM character_state_values WHERE character_id IN (${placeholders})
     ORDER BY character_id, field_key ASC`,
  ).all(...characterIds);
  for (const r of rows) result[r.character_id].push(r);
  return result;
}

/**
 * 联表查询：角色状态字段定义 + 当前值，按 sort_order 升序
 * @param {string} characterId
 * @returns {{ field_key, label, type, sort_order, value_json }[]}
 */
export function getCharacterStateValuesWithFields(characterId) {
  return db.prepare(`
    SELECT
      csf.field_key,
      csf.label,
      csf.type,
      csf.prefix,
      csf.unit,
      csf.sort_order,
      csf.enum_options,
      csf.table_columns,
      csf.default_value AS field_default_value,
      csv.default_value_json AS stored_default_value_json,
      csv.runtime_value_json,
      CASE
        WHEN csv.id IS NOT NULL THEN csv.default_value_json
        ELSE csf.default_value
      END AS default_value_json,
      CASE
        WHEN csv.runtime_value_json IS NOT NULL THEN csv.runtime_value_json
        WHEN csv.id IS NOT NULL THEN csv.default_value_json
        ELSE csf.default_value
      END AS effective_value_json
    FROM character_state_fields csf
    LEFT JOIN character_state_values csv
      ON csf.field_key = csv.field_key AND csv.character_id = ?
    WHERE csf.world_id = (SELECT world_id FROM characters WHERE id = ?)
    ORDER BY csf.sort_order ASC
  `).all(characterId, characterId);
}
