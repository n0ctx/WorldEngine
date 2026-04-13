import crypto from 'node:crypto';
import db from '../index.js';

// value_json 保持原始 JSON 字符串，调用方按字段 type 自行解析

/**
 * 插入或更新世界状态值
 * @param {string} worldId
 * @param {string} fieldKey
 * @param {string|null} valueJson — 已 JSON.stringify 的字符串，或 null
 */
export function upsertWorldStateValue(worldId, fieldKey, valueJson) {
  const existing = db.prepare(
    'SELECT id FROM world_state_values WHERE world_id = ? AND field_key = ?',
  ).get(worldId, fieldKey);
  const now = Date.now();

  if (existing) {
    db.prepare(
      'UPDATE world_state_values SET value_json = ?, updated_at = ? WHERE world_id = ? AND field_key = ?',
    ).run(valueJson, now, worldId, fieldKey);
    return db.prepare(
      'SELECT * FROM world_state_values WHERE world_id = ? AND field_key = ?',
    ).get(worldId, fieldKey);
  } else {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO world_state_values (id, world_id, field_key, value_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, worldId, fieldKey, valueJson, now);
    return db.prepare('SELECT * FROM world_state_values WHERE id = ?').get(id);
  }
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
