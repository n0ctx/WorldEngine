/**
 * state-memory-migration.js — 状态记忆旧数据一次性迁移专用 SQL
 *
 * 只放迁移专属的读取与结构变更：旧表（附近角色）读取、世界字段/条件改写、删表删列、
 * internal_meta 读写。写入新状态记忆表走既有的 db/queries/state-memory.js 与
 * db/queries/session-entity-state-values.js，这里不重复。
 *
 * 对外接口：
 *   isStateMemoryMigrated() / markStateMemoryMigrated()
 *   runStateMemoryMigrationTransaction(callback)
 *   listAllSessions() / listAllWorldIds()
 *   listLegacyNearbyCharacters(sessionId) / listLegacyNearbyStateValues(nearbyId)
 *   deactivateDefaultNearbyCharacterFields(fieldKeys)
 *   getWorldStateField(worldId, fieldKey) / getWorldStateValue(worldId, fieldKey)
 *   getSessionWorldStateValueRaw(sessionId, worldId, fieldKey)
 *   rewriteEntryConditionsTargetField(worldId, fromTarget, toTarget)
 *   deleteWorldStateFieldAndValues(worldId, fieldKey)
 *   dropLegacyNearbyTables() / dropTableMemorySnapshotColumn()
 */

import db from '../index.js';
import { withSessionStateTransaction } from './session-state-batch.js';

const MIGRATION_KEY = 'state_memory_migrated_v1';

export function isStateMemoryMigrated() {
  return db.prepare('SELECT value FROM internal_meta WHERE key = ?').get(MIGRATION_KEY)?.value === '1';
}

export function markStateMemoryMigrated() {
  db.prepare(`
    INSERT INTO internal_meta (key, value, updated_at) VALUES (?, '1', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(MIGRATION_KEY, Date.now());
}

export function runStateMemoryMigrationTransaction(callback) {
  return withSessionStateTransaction(callback);
}

function tableExists(name) {
  return !!db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name);
}

function columnExists(table, column) {
  return db.pragma(`table_info(${table})`).some((col) => col.name === column);
}

function hasLegacyNearbyTables() {
  return tableExists('session_nearby_characters');
}

/** 全部会话及其所属 world_id（chat 会话经 character_id 关联，writing 会话直接挂 world_id）。 */
export function listAllSessions() {
  return db.prepare(`
    SELECT s.id AS id, COALESCE(s.world_id, c.world_id) AS world_id
    FROM sessions s
    LEFT JOIN characters c ON c.id = s.character_id
  `).all();
}

export function listAllWorldIds() {
  return db.prepare(`SELECT id FROM worlds`).all().map((row) => row.id);
}

/** 某会话下全部旧附近角色（含临时与已保存）；旧表不存在（新库）时返回空数组。 */
export function listLegacyNearbyCharacters(sessionId) {
  if (!hasLegacyNearbyTables()) return [];
  return db.prepare(`
    SELECT id, name, persona, is_saved FROM session_nearby_characters
    WHERE session_id = ? ORDER BY created_at ASC
  `).all(sessionId);
}

export function listLegacyNearbyStateValues(nearbyId) {
  return db.prepare(`
    SELECT field_key, runtime_value_json FROM session_nearby_character_state_values WHERE nearby_id = ?
  `).all(nearbyId);
}

export function deactivateDefaultNearbyCharacterFields(fieldKeys) {
  if (fieldKeys.length === 0) return;
  const placeholders = fieldKeys.map(() => '?').join(', ');
  db.prepare(`UPDATE character_state_fields SET nearby_enabled = 0 WHERE field_key IN (${placeholders})`)
    .run(...fieldKeys);
}

export function getWorldStateField(worldId, fieldKey) {
  return db.prepare(`SELECT * FROM world_state_fields WHERE world_id = ? AND field_key = ?`).get(worldId, fieldKey);
}

export function getWorldStateValue(worldId, fieldKey) {
  return db.prepare(`SELECT * FROM world_state_values WHERE world_id = ? AND field_key = ?`).get(worldId, fieldKey);
}

export function getSessionWorldStateValueRaw(sessionId, worldId, fieldKey) {
  return db.prepare(`
    SELECT runtime_value_json FROM session_world_state_values
    WHERE session_id = ? AND world_id = ? AND field_key = ?
  `).get(sessionId, worldId, fieldKey)?.runtime_value_json ?? null;
}

/** 把某世界下引用 fromTarget 的条目条件改写为 toTarget（如 `世界.时间` → 保留名）。 */
export function rewriteEntryConditionsTargetField(worldId, fromTarget, toTarget) {
  db.prepare(`
    UPDATE entry_conditions SET target_field = ?
    WHERE target_field = ? AND entry_id IN (SELECT id FROM world_prompt_entries WHERE world_id = ?)
  `).run(toTarget, fromTarget, worldId);
}

/** 删除某世界字段本身及其世界级 / 会话级全部取值。 */
export function deleteWorldStateFieldAndValues(worldId, fieldKey) {
  db.prepare(`DELETE FROM session_world_state_values WHERE world_id = ? AND field_key = ?`).run(worldId, fieldKey);
  db.prepare(`DELETE FROM world_state_values WHERE world_id = ? AND field_key = ?`).run(worldId, fieldKey);
  db.prepare(`DELETE FROM world_state_fields WHERE world_id = ? AND field_key = ?`).run(worldId, fieldKey);
}

export function dropLegacyNearbyTables() {
  if (tableExists('session_nearby_character_state_values')) {
    db.exec('DROP TABLE session_nearby_character_state_values');
  }
  if (tableExists('session_nearby_characters')) {
    db.exec('DROP TABLE session_nearby_characters');
  }
}

export function dropTableMemorySnapshotColumn() {
  if (tableExists('turn_records') && columnExists('turn_records', 'table_memory_snapshot')) {
    db.exec('ALTER TABLE turn_records DROP COLUMN table_memory_snapshot');
  }
}
