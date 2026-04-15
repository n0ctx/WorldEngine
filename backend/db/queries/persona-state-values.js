import crypto from 'node:crypto';
import db from '../index.js';

// value_json 保持原始 JSON 字符串，调用方按字段 type 自行解析

/**
 * 插入或更新玩家状态值
 * @param {string} worldId
 * @param {string} fieldKey
 * @param {string|null} valueJson — 已 JSON.stringify 的字符串，或 null
 */
export function upsertPersonaStateValue(worldId, fieldKey, valueJson) {
  const existing = db.prepare(
    'SELECT id FROM persona_state_values WHERE world_id = ? AND field_key = ?',
  ).get(worldId, fieldKey);
  const now = Date.now();

  if (existing) {
    db.prepare(
      'UPDATE persona_state_values SET value_json = ?, updated_at = ? WHERE world_id = ? AND field_key = ?',
    ).run(valueJson, now, worldId, fieldKey);
    return db.prepare(
      'SELECT * FROM persona_state_values WHERE world_id = ? AND field_key = ?',
    ).get(worldId, fieldKey);
  } else {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO persona_state_values (id, world_id, field_key, value_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, worldId, fieldKey, valueJson, now);
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
    SELECT psf.field_key, psf.label, psf.type, psf.sort_order, psf.enum_options, psv.value_json
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
