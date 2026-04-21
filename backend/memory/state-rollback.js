/**
 * state-rollback.js — 状态快照捕获与回滚
 *
 * 对外暴露：
 *   captureStateSnapshot(sessionId, worldId, characterIds)      → snapshot 对象
 *   restoreStateFromSnapshot(sessionId, worldId, characterIds, snapshot)
 *     snapshot=null 时降级：清空回 default
 */

import db from '../db/index.js';
import { upsertSessionWorldStateValue, clearSessionWorldStateValues } from '../db/queries/session-world-state-values.js';
import { upsertSessionPersonaStateValue, clearSessionPersonaStateValues } from '../db/queries/session-persona-state-values.js';
import {
  upsertSessionCharacterStateValue,
  clearSingleCharacterSessionStateValues,
  clearSessionCharacterStateValues,
} from '../db/queries/session-character-state-values.js';

/**
 * 捕获当前会话的三层状态快照（从 session_*_state_values 表读取）
 *
 * @param {string} sessionId
 * @param {string} worldId
 * @param {string[]} characterIds
 * @returns {{ world: object, persona: object, character: object }}
 */
export function captureStateSnapshot(sessionId, worldId, characterIds) {
  const snapshot = { world: {}, persona: {}, character: {} };

  // 世界状态
  const worldRows = db.prepare(
    'SELECT field_key, runtime_value_json FROM session_world_state_values WHERE session_id = ? AND world_id = ?',
  ).all(sessionId, worldId);
  for (const r of worldRows) {
    if (r.runtime_value_json != null) snapshot.world[r.field_key] = r.runtime_value_json;
  }

  // 玩家状态
  const personaRows = db.prepare(
    'SELECT field_key, runtime_value_json FROM session_persona_state_values WHERE session_id = ? AND world_id = ?',
  ).all(sessionId, worldId);
  for (const r of personaRows) {
    if (r.runtime_value_json != null) snapshot.persona[r.field_key] = r.runtime_value_json;
  }

  // 角色状态
  for (const cid of characterIds) {
    snapshot.character[cid] = {};
    const charRows = db.prepare(
      'SELECT field_key, runtime_value_json FROM session_character_state_values WHERE session_id = ? AND character_id = ?',
    ).all(sessionId, cid);
    for (const r of charRows) {
      if (r.runtime_value_json != null) snapshot.character[cid][r.field_key] = r.runtime_value_json;
    }
  }

  return snapshot;
}

/**
 * 从快照恢复会话三层状态；snapshot=null 时清空回 default
 *
 * @param {string} sessionId
 * @param {string} worldId
 * @param {string[]} characterIds  当前会话的角色 ID 列表
 * @param {object|null} snapshot   captureStateSnapshot 的返回值，或 null
 */
export function restoreStateFromSnapshot(sessionId, worldId, characterIds, snapshot) {
  if (!snapshot) {
    // 无快照可恢复，清空回 default（降级）
    clearSessionWorldStateValues(sessionId);
    clearSessionPersonaStateValues(sessionId);
    clearSessionCharacterStateValues(sessionId);
    return;
  }

  // 世界状态：先清空，再写入快照值
  clearSessionWorldStateValues(sessionId);
  for (const [key, valueJson] of Object.entries(snapshot.world ?? {})) {
    upsertSessionWorldStateValue(sessionId, worldId, key, valueJson);
  }

  // 玩家状态：先清空，再写入快照值
  clearSessionPersonaStateValues(sessionId);
  for (const [key, valueJson] of Object.entries(snapshot.persona ?? {})) {
    upsertSessionPersonaStateValue(sessionId, worldId, key, valueJson);
  }

  // 角色状态：按角色逐一清空并写入快照值
  for (const cid of characterIds) {
    clearSingleCharacterSessionStateValues(sessionId, cid);
    const cs = snapshot.character?.[cid];
    if (cs) {
      for (const [key, valueJson] of Object.entries(cs)) {
        upsertSessionCharacterStateValue(sessionId, cid, key, valueJson);
      }
    }
  }
}
