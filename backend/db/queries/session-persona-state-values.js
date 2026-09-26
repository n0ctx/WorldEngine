import crypto from 'node:crypto';
import db from '../index.js';
import { writeSessionStateRows } from './session-state-batch.js';

/**
 * Upsert 会话级玩家状态运行时值
 */
export function upsertSessionPersonaStateValue(sessionId, worldId, fieldKey, runtimeValueJson) {
  upsertSessionPersonaStateValues(sessionId, worldId, [{ fieldKey, runtimeValueJson }]);
}

/** 批量写入会话玩家状态。 */
export function upsertSessionPersonaStateValues(sessionId, worldId, values) {
  if (values.length === 0) return;
  const now = Date.now();
  writeSessionStateRows({
    table: 'session_persona_state_values',
    columns: ['id', 'session_id', 'world_id', 'field_key', 'runtime_value_json', 'updated_at'],
    rows: values.map(({ fieldKey, runtimeValueJson }) => [
      crypto.randomUUID(), sessionId, worldId, fieldKey, runtimeValueJson, now,
    ]),
    conflict: {
      columns: ['session_id', 'world_id', 'field_key'],
      updateColumns: ['runtime_value_json', 'updated_at'],
    },
  });
}

/**
 * 获取某会话下某世界的所有玩家运行时状态值，返回 { field_key → runtime_value_json } Map
 */
export function getSessionPersonaStateValues(sessionId, worldId) {
  const rows = db.prepare(
    'SELECT field_key, runtime_value_json FROM session_persona_state_values WHERE session_id = ? AND world_id = ?',
  ).all(sessionId, worldId);
  return Object.fromEntries(rows.map((r) => [r.field_key, r.runtime_value_json]));
}

/**
 * 清空某会话的所有玩家运行时状态（消息回滚时调用）
 */
export function clearSessionPersonaStateValues(sessionId) {
  db.prepare('DELETE FROM session_persona_state_values WHERE session_id = ?').run(sessionId);
}
