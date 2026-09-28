/**
 * session-entity-state-values.js — 角色实体的用户字段运行时值
 *
 * 走 D2 的快照机制（非多版本）：状态记忆回滚时随 rollbackStateMemory 一并清理，
 * 手动状态快照恢复时随 session-state-batch.js 的 writeSessionStateRows 批量写入。
 *
 * 对外接口：
 *   upsertEntityStateValues(sessionId, rows) → void
 *   getEntityStateValues(sessionId, entityIds) → { [entityId]: { [fieldKey]: runtime_value_json } }
 *   clearEntityStateValuesBySession(sessionId) → void
 *   deleteEntityStateValuesByEntity(entityId) → void
 */

import crypto from 'node:crypto';
import db from '../index.js';
import { writeSessionStateRows } from './session-state-batch.js';

/**
 * 批量写入角色实体的用户字段运行时值；命中 (entity_id, field_key) 唯一约束时更新。
 * @param {string} sessionId
 * @param {{ entityId: string, fieldKey: string, runtimeValueJson: string|null }[]} rows
 */
export function upsertEntityStateValues(sessionId, rows) {
  if (rows.length === 0) return;
  const now = Date.now();
  writeSessionStateRows({
    table: 'session_entity_state_values',
    columns: ['id', 'session_id', 'entity_id', 'field_key', 'runtime_value_json', 'updated_at'],
    rows: rows.map(({ entityId, fieldKey, runtimeValueJson }) => [
      crypto.randomUUID(), sessionId, entityId, fieldKey, runtimeValueJson, now,
    ]),
    conflict: {
      columns: ['entity_id', 'field_key'],
      updateColumns: ['runtime_value_json', 'updated_at'],
    },
  });
}

/**
 * 一次取出多个实体的用户字段运行时值，返回 { entity_id → { field_key → runtime_value_json } }；
 * 没有任何值的实体也会得到空对象。
 * @param {string[]} entityIds
 */
export function getEntityStateValues(sessionId, entityIds) {
  // guard-allow(duplication): 与 session-character-state-values.js 的按 ID 分组取值同构，沿用既有查询模式
  const result = Object.fromEntries(entityIds.map((id) => [id, {}]));
  if (entityIds.length === 0) return result;
  const placeholders = entityIds.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT entity_id, field_key, runtime_value_json FROM session_entity_state_values
    WHERE session_id = ? AND entity_id IN (${placeholders})
  `).all(sessionId, ...entityIds);
  for (const row of rows) result[row.entity_id][row.field_key] = row.runtime_value_json;
  return result;
}

/** 清空某会话下全部实体的用户字段运行时值（快照恢复时先清后写）。 */
export function clearEntityStateValuesBySession(sessionId) {
  db.prepare('DELETE FROM session_entity_state_values WHERE session_id = ?').run(sessionId);
}

/** 清空单个实体的用户字段运行时值（实体被删除时调用）。 */
export function deleteEntityStateValuesByEntity(entityId) {
  db.prepare('DELETE FROM session_entity_state_values WHERE entity_id = ?').run(entityId);
}
