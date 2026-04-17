import crypto from 'node:crypto';
import db from '../index.js';

// default_value_json / runtime_value_json 保持原始 JSON 字符串，调用方按字段 type 自行解析

/**
 * upsert 玩家状态值
 * @param {string} worldId
 * @param {string} fieldKey
 * @param {{ defaultValueJson?: string|null, runtimeValueJson?: string|null, touchUpdatedAt?: boolean, skipCreate?: boolean }} patch
 */
export function upsertPersonaStateValue(worldId, fieldKey, patch = {}) {
  const existing = db.prepare(
    'SELECT id FROM persona_state_values WHERE world_id = ? AND field_key = ?',
  ).get(worldId, fieldKey);
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
    if (sets.length === 0) {
      return db.prepare(
        'SELECT * FROM persona_state_values WHERE world_id = ? AND field_key = ?',
      ).get(worldId, fieldKey);
    }
    values.push(worldId, fieldKey);
    db.prepare(
      `UPDATE persona_state_values SET ${sets.join(', ')} WHERE world_id = ? AND field_key = ?`,
    ).run(...values);
    return db.prepare(
      'SELECT * FROM persona_state_values WHERE world_id = ? AND field_key = ?',
    ).get(worldId, fieldKey);
  } else {
    if (skipCreate) return null;
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO persona_state_values (
        id, world_id, field_key, default_value_json, runtime_value_json, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      worldId,
      fieldKey,
      hasDefault ? patch.defaultValueJson : null,
      hasRuntime ? patch.runtimeValueJson : null,
      touchUpdatedAt ? now : 0,
    );
    return db.prepare('SELECT * FROM persona_state_values WHERE id = ?').get(id);
  }
}

/**
 * 获取某世界的所有玩家状态值
 */
export function getAllPersonaStateValues(worldId) {
  return db.prepare(
    'SELECT * FROM persona_state_values WHERE world_id = ? ORDER BY field_key ASC',
  ).all(worldId);
}

/**
 * 联表查询：玩家状态字段定义 + 当前值，按 sort_order 升序
 * @param {string} worldId
 * @returns {{ field_key, label, type, sort_order, value_json }[]}
 */
export function getPersonaStateValuesWithFields(worldId) {
  return db.prepare(`
    SELECT
      psf.field_key,
      psf.label,
      psf.type,
      psf.sort_order,
      psf.enum_options,
      psf.default_value AS field_default_value,
      psv.default_value_json AS stored_default_value_json,
      psv.runtime_value_json,
      CASE
        WHEN psv.id IS NOT NULL THEN psv.default_value_json
        ELSE psf.default_value
      END AS default_value_json,
      CASE
        WHEN psv.runtime_value_json IS NOT NULL THEN psv.runtime_value_json
        WHEN psv.id IS NOT NULL THEN psv.default_value_json
        ELSE psf.default_value
      END AS effective_value_json
    FROM persona_state_fields psf
    LEFT JOIN persona_state_values psv
      ON psf.world_id = psv.world_id AND psf.field_key = psv.field_key
    WHERE psf.world_id = ?
    ORDER BY psf.sort_order ASC
  `).all(worldId);
}

/**
 * 删除单个玩家状态值（字段删除时调用）
 */
export function deletePersonaStateValue(worldId, fieldKey) {
  return db.prepare(
    'DELETE FROM persona_state_values WHERE world_id = ? AND field_key = ?',
  ).run(worldId, fieldKey);
}
