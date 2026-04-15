import crypto from 'node:crypto';
import db from '../index.js';

// value_json 保持原始 JSON 字符串，调用方按字段 type 自行解析

/**
 * 插入或更新角色状态值
 * @param {string} characterId
 * @param {string} fieldKey
 * @param {string|null} valueJson — 已 JSON.stringify 的字符串，或 null
 */
export function upsertCharacterStateValue(characterId, fieldKey, valueJson) {
  const existing = db.prepare(
    'SELECT id FROM character_state_values WHERE character_id = ? AND field_key = ?',
  ).get(characterId, fieldKey);
  const now = Date.now();

  if (existing) {
    db.prepare(
      'UPDATE character_state_values SET value_json = ?, updated_at = ? WHERE character_id = ? AND field_key = ?',
    ).run(valueJson, now, characterId, fieldKey);
    return db.prepare(
      'SELECT * FROM character_state_values WHERE character_id = ? AND field_key = ?',
    ).get(characterId, fieldKey);
  } else {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO character_state_values (id, character_id, field_key, value_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, characterId, fieldKey, valueJson, now);
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
    SELECT csf.field_key, csf.label, csf.type, csf.sort_order, csf.enum_options, csv.value_json
    FROM character_state_fields csf
    LEFT JOIN character_state_values csv
      ON csf.field_key = csv.field_key AND csv.character_id = ?
    WHERE csf.world_id = (SELECT world_id FROM characters WHERE id = ?)
    ORDER BY csf.sort_order ASC
  `).all(characterId, characterId);
}
