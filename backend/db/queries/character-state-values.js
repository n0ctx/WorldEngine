import crypto from 'node:crypto';
import db from '../index.js';

// default_value_json / runtime_value_json 保持原始 JSON 字符串，调用方按字段 type 自行解析

/**
 * upsert 角色状态值
 * @param {string} characterId
 * @param {string} fieldKey
 * @param {{ defaultValueJson?: string|null, runtimeValueJson?: string|null, touchUpdatedAt?: boolean, skipCreate?: boolean }} patch
 */
export function upsertCharacterStateValue(characterId, fieldKey, patch = {}) {
  const existing = db.prepare(
    'SELECT id FROM character_state_values WHERE character_id = ? AND field_key = ?',
  ).get(characterId, fieldKey);
  const now = Date.now();
  const hasDefault = Object.hasOwn(patch, 'defaultValueJson');
  const hasRuntime = Object.hasOwn(patch, 'runtimeValueJson');
  const touchUpdatedAt = patch.touchUpdatedAt ?? hasRuntime;
  const skipCreate = patch.skipCreate ?? false;

  if (existing) {
    const sets = [];
    const values = [];
    if (hasDefault) {
      sets.push('default_value_json = ?');
      values.push(patch.defaultValueJson);
    }
    if (hasRuntime) {
      sets.push('runtime_value_json = ?');
      values.push(patch.runtimeValueJson);
    }
    if (touchUpdatedAt) {
      sets.push('updated_at = ?');
      values.push(now);
    }
    if (sets.length === 0) return getCharacterStateValue(characterId, fieldKey);
    values.push(characterId, fieldKey);
    db.prepare(
      `UPDATE character_state_values SET ${sets.join(', ')} WHERE character_id = ? AND field_key = ?`,
    ).run(...values);
    return db.prepare(
      'SELECT * FROM character_state_values WHERE character_id = ? AND field_key = ?',
    ).get(characterId, fieldKey);
  } else {
    if (skipCreate) return null;
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO character_state_values (
        id, character_id, field_key, default_value_json, runtime_value_json, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      characterId,
      fieldKey,
      hasDefault ? patch.defaultValueJson : null,
      hasRuntime ? patch.runtimeValueJson : null,
      touchUpdatedAt ? now : 0,
    );
    return db.prepare('SELECT * FROM character_state_values WHERE id = ?').get(id);
  }
}

/**
 * 获取单个角色状态值
 */
export function getCharacterStateValue(characterId, fieldKey) {
  return db.prepare(
    'SELECT * FROM character_state_values WHERE character_id = ? AND field_key = ?',
  ).get(characterId, fieldKey);
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
 * 删除单个角色状态值（字段删除时调用）
 */
export function deleteCharacterStateValue(characterId, fieldKey) {
  return db.prepare(
    'DELETE FROM character_state_values WHERE character_id = ? AND field_key = ?',
  ).run(characterId, fieldKey);
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
      csf.sort_order,
      csf.enum_options,
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
