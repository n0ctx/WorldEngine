import crypto from 'node:crypto';
import db from '../index.js';

// default_value_json / runtime_value_json 保持原始 JSON 字符串，调用方按字段 type 自行解析

/**
 * 解析世界当前激活的 persona_id。
 * active_persona_id 为 NULL 时，回退到最早创建的 persona。
 */
function resolveActivePersonaId(worldId) {
  const world = db.prepare('SELECT active_persona_id FROM worlds WHERE id = ?').get(worldId);
  if (!world) return null;
  if (world.active_persona_id) return world.active_persona_id;
  const persona = db.prepare(
    'SELECT id FROM personas WHERE world_id = ? ORDER BY created_at ASC, id ASC LIMIT 1',
  ).get(worldId);
  return persona?.id ?? null;
}

/**
 * upsert 玩家状态值（直接指定 personaId，供创建流程使用）
 * @param {string} personaId
 * @param {string} worldId
 * @param {string} fieldKey
 * @param {{ defaultValueJson?: string|null, runtimeValueJson?: string|null, touchUpdatedAt?: boolean, skipCreate?: boolean }} patch
 */
export function upsertPersonaStateValueByPersonaId(personaId, worldId, fieldKey, patch = {}) {
  const existing = db.prepare(
    'SELECT id FROM persona_state_values WHERE persona_id = ? AND field_key = ?',
  ).get(personaId, fieldKey);
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
        'SELECT * FROM persona_state_values WHERE persona_id = ? AND field_key = ?',
      ).get(personaId, fieldKey);
    }
    values.push(personaId, fieldKey);
    db.prepare(
      `UPDATE persona_state_values SET ${sets.join(', ')} WHERE persona_id = ? AND field_key = ?`,
    ).run(...values);
    return db.prepare(
      'SELECT * FROM persona_state_values WHERE persona_id = ? AND field_key = ?',
    ).get(personaId, fieldKey);
  } else {
    if (skipCreate) return null;
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO persona_state_values (
        id, persona_id, world_id, field_key, default_value_json, runtime_value_json, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      personaId,
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
 * upsert 玩家状态值（按 worldId，内部解析当前激活 persona）
 * @param {string} worldId
 * @param {string} fieldKey
 * @param {{ defaultValueJson?: string|null, runtimeValueJson?: string|null, touchUpdatedAt?: boolean, skipCreate?: boolean }} patch
 */
export function upsertPersonaStateValue(worldId, fieldKey, patch = {}) {
  const personaId = resolveActivePersonaId(worldId);
  if (!personaId) return null;
  return upsertPersonaStateValueByPersonaId(personaId, worldId, fieldKey, patch);
}

/**
 * 获取某世界当前激活 persona 的所有状态值
 */
export function getAllPersonaStateValues(worldId) {
  const personaId = resolveActivePersonaId(worldId);
  if (!personaId) return [];
  return db.prepare(
    'SELECT * FROM persona_state_values WHERE persona_id = ? ORDER BY field_key ASC',
  ).all(personaId);
}

/**
 * 按 persona_id 直接获取该 persona 的所有状态值（不依赖世界 active）。
 * 用于写作 session：session 自带 persona_id，无需再走 active 路径。
 */
export function getAllPersonaStateValuesByPersonaId(personaId) {
  if (!personaId) return [];
  return db.prepare(
    'SELECT * FROM persona_state_values WHERE persona_id = ? ORDER BY field_key ASC',
  ).all(personaId);
}

/**
 * 联表查询：玩家状态字段定义 + 当前激活 persona 的值，按 sort_order 升序
 * @param {string} worldId
 * @returns {{ field_key, label, type, sort_order, value_json }[]}
 */
export function getPersonaStateValuesWithFields(worldId) {
  const personaId = resolveActivePersonaId(worldId);
  return db.prepare(`
    SELECT
      psf.field_key,
      psf.label,
      psf.type,
      psf.prefix,
      psf.unit,
      psf.sort_order,
      psf.enum_options,
      psf.table_columns,
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
      ON psv.persona_id = ? AND psv.field_key = psf.field_key
    WHERE psf.world_id = ?
    ORDER BY psf.sort_order ASC
  `).all(personaId, worldId);
}

/**
 * 删除单个玩家状态值（按当前激活 persona）
 */
export function deletePersonaStateValue(worldId, fieldKey) {
  const personaId = resolveActivePersonaId(worldId);
  if (!personaId) return null;
  return db.prepare(
    'DELETE FROM persona_state_values WHERE persona_id = ? AND field_key = ?',
  ).run(personaId, fieldKey);
}

/**
 * 联表查询：指定 persona 的状态字段定义 + 值，按 sort_order 升序
 * @param {string} personaId
 * @param {string} worldId
 */
export function getPersonaStateValuesWithFieldsByPersonaId(personaId, worldId) {
  return db.prepare(`
    SELECT
      psf.field_key,
      psf.label,
      psf.type,
      psf.prefix,
      psf.unit,
      psf.sort_order,
      psf.enum_options,
      psf.table_columns,
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
      ON psv.persona_id = ? AND psv.field_key = psf.field_key
    WHERE psf.world_id = ?
    ORDER BY psf.sort_order ASC
  `).all(personaId, worldId);
}

/**
 * 批量更新某字段下所有 persona 的 default_value_json，
 * 但仅更新尚未被用户定制（当前值为 null 或等于旧默认值）的行。
 * 用于字段模板 default_value 变更时同步"跟踪默认值"的 persona。
 */
export function updatePersonaDefaultStateValuesIfNotCustomized(worldId, fieldKey, oldDefaultJson, newDefaultJson) {
  db.prepare(`
    UPDATE persona_state_values
    SET default_value_json = ?
    WHERE world_id = ? AND field_key = ?
      AND (default_value_json IS NULL OR default_value_json = ?)
  `).run(newDefaultJson, worldId, fieldKey, oldDefaultJson);
}

/**
 * 删除某字段在该世界所有 persona 下的状态值行（字段删除时调用）
 */
export function deletePersonaStateValuesByFieldKey(worldId, fieldKey) {
  return db.prepare(
    'DELETE FROM persona_state_values WHERE world_id = ? AND field_key = ?',
  ).run(worldId, fieldKey);
}

/**
 * 清空当前激活 persona 所有状态字段的运行时值（回滚状态时调用）
 */
export function clearPersonaStateRuntimeValues(worldId) {
  const personaId = resolveActivePersonaId(worldId);
  if (!personaId) return;
  db.prepare('UPDATE persona_state_values SET runtime_value_json = NULL WHERE persona_id = ?').run(personaId);
}
