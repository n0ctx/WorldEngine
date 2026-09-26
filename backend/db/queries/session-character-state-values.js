import crypto from 'node:crypto';
import db from '../index.js';
import { writeSessionStateRows } from './session-state-batch.js';

/**
 * Upsert 会话级角色状态运行时值
 */
export function upsertSessionCharacterStateValue(sessionId, characterId, fieldKey, runtimeValueJson) {
  upsertSessionCharacterStateValues(sessionId, [{ characterId, fieldKey, runtimeValueJson }]);
}

/** 批量写入会话角色状态。 */
export function upsertSessionCharacterStateValues(sessionId, values) {
  if (values.length === 0) return;
  const now = Date.now();
  writeSessionStateRows({
    table: 'session_character_state_values',
    columns: ['id', 'session_id', 'character_id', 'field_key', 'runtime_value_json', 'updated_at'],
    rows: values.map(({ characterId, fieldKey, runtimeValueJson }) => [
      crypto.randomUUID(), sessionId, characterId, fieldKey, runtimeValueJson, now,
    ]),
    conflict: {
      columns: ['session_id', 'character_id', 'field_key'],
      updateColumns: ['runtime_value_json', 'updated_at'],
    },
  });
}

/**
 * 一次取出某会话下多个角色的运行时状态值，返回 { character_id → { field_key → runtime_value_json } }；
 * 没有任何值的角色也会得到空对象。
 * @param {string[]} characterIds
 */
export function getSessionCharacterStateValuesByCharacterIds(sessionId, characterIds) {
  const result = Object.fromEntries(characterIds.map((id) => [id, {}]));
  if (characterIds.length === 0) return result;
  const placeholders = characterIds.map(() => '?').join(', ');
  const rows = db.prepare(
    `SELECT character_id, field_key, runtime_value_json FROM session_character_state_values
     WHERE session_id = ? AND character_id IN (${placeholders})`,
  ).all(sessionId, ...characterIds);
  for (const r of rows) result[r.character_id][r.field_key] = r.runtime_value_json;
  return result;
}

/**
 * 清空某会话的所有角色运行时状态（消息回滚时调用）
 */
export function clearSessionCharacterStateValues(sessionId) {
  db.prepare('DELETE FROM session_character_state_values WHERE session_id = ?').run(sessionId);
}

/**
 * 清空某会话下指定角色的运行时状态（单角色重置时调用）
 */
export function clearSingleCharacterSessionStateValues(sessionId, characterId) {
  db.prepare(
    'DELETE FROM session_character_state_values WHERE session_id = ? AND character_id = ?',
  ).run(sessionId, characterId);
}

/** 一次清空指定角色的会话运行时状态。 */
export function clearSessionCharacterStateValuesByCharacterIds(sessionId, characterIds) {
  if (characterIds.length === 0) return;
  const idsPerStatement = 899;
  // guard-allow(perf-shape): 每批留一个绑定参数给 sessionId，单条语句不超过 900 个参数。
  for (let offset = 0; offset < characterIds.length; offset += idsPerStatement) {
    const ids = characterIds.slice(offset, offset + idsPerStatement);
    const placeholders = ids.map(() => '?').join(', ');
    db.prepare(
      `DELETE FROM session_character_state_values WHERE session_id = ? AND character_id IN (${placeholders})`,
    ).run(sessionId, ...ids);
  }
}
