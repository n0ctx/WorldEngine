/**
 * state-rollback.js — 状态快照捕获与回滚
 *
 * 对外暴露：
 *   captureStateSnapshot(sessionId, worldId, characterIds)      → snapshot 对象
 *   restoreStateFromSnapshot(sessionId, worldId, characterIds, snapshot)
 *     snapshot=null 时保留现状（首轮重生成场景：用户手动加的 nearby / state 是显式意图，不能清）
 */

import {
  upsertSessionWorldStateValues,
  getSessionWorldStateValues,
  clearSessionWorldStateValues,
} from '../db/queries/session-world-state-values.js';
import {
  upsertSessionPersonaStateValues,
  getSessionPersonaStateValues,
  clearSessionPersonaStateValues,
} from '../db/queries/session-persona-state-values.js';
import {
  upsertSessionCharacterStateValues,
  getSessionCharacterStateValuesByCharacterIds,
  clearSessionCharacterStateValuesByCharacterIds,
} from '../db/queries/session-character-state-values.js';
import {
  listNearbyBySessionId,
  deleteNearbyBySessionId,
  createNearbyCharacters,
} from '../db/queries/session-nearby-characters.js';
import { upsertNearbyStateValues, getStateValuesByNearbyIds } from '../db/queries/session-nearby-character-state-values.js';
import { withSessionStateTransaction } from '../db/queries/session-state-batch.js';

function withoutNullValues(valueMap) {
  return Object.fromEntries(Object.entries(valueMap).filter(([, v]) => v != null));
}

/**
 * 捕获当前会话的三层状态快照（从 session_*_state_values 表读取）
 *
 * @param {string} sessionId
 * @param {string} worldId
 * @param {string[]} characterIds
 * @returns {{ world: object, persona: object, character: object }}
 */
export function captureStateSnapshot(sessionId, worldId, characterIds) {
  const charValues = getSessionCharacterStateValuesByCharacterIds(sessionId, characterIds);
  const snapshot = {
    world: withoutNullValues(getSessionWorldStateValues(sessionId, worldId)),
    persona: withoutNullValues(getSessionPersonaStateValues(sessionId, worldId)),
    character: {},
  };
  for (const cid of characterIds) snapshot.character[cid] = withoutNullValues(charValues[cid]);

  return snapshot;
}

/**
 * 捕获「完整」快照：三层状态 + （写作模式）nearby 层。
 * 与 createTurnRecord 写入 turn record 的快照口径一致，供基线捕获与轮次快照共用，
 * 避免回滚时 nearby 缺失被 restoreStateFromSnapshot 清空。
 *
 * @param {string} sessionId
 * @param {string} worldId
 * @param {string[]} characterIds
 * @param {boolean} includeNearby  写作模式传 true
 */
export function captureFullSnapshot(sessionId, worldId, characterIds, includeNearby) {
  const snapshot = captureStateSnapshot(sessionId, worldId, characterIds);
  if (includeNearby) {
    const rows = listNearbyBySessionId(sessionId);
    const valuesByNearby = getStateValuesByNearbyIds(rows.map((r) => r.id));
    snapshot.nearby = rows.map((r) => {
      const state = {};
      for (const s of valuesByNearby.get(r.id)) {
        if (s.runtime_value_json != null) state[s.field_key] = s.runtime_value_json;
      }
      return { id: r.id, name: r.name, persona: r.persona, is_saved: r.is_saved, state };
    });
  }
  return snapshot;
}

/**
 * 从快照恢复会话三层状态；snapshot=null 时保留现状
 *
 * @param {string} sessionId
 * @param {string} worldId
 * @param {string[]} characterIds  当前会话的角色 ID 列表
 * @param {object|null} snapshot   captureStateSnapshot 的返回值，或 null
 */
export function restoreStateFromSnapshot(sessionId, worldId, characterIds, snapshot) {
  if (!snapshot) {
    // 无 turn record 检查点（典型场景：重生成首轮对话）。
    // 当前 session state / nearby 是用户在首轮前的手动配置，是显式意图，必须保留。
    // 早期实现会清空回 default，导致用户从角色卡添加的"附近角色"被静默删除。
    return;
  }

  withSessionStateTransaction(() => {
    // 世界状态：先清空，再批量写入快照值。
    clearSessionWorldStateValues(sessionId);
    upsertSessionWorldStateValues(sessionId, worldId, Object.entries(snapshot.world ?? {}).map(([fieldKey, runtimeValueJson]) => ({
      fieldKey,
      runtimeValueJson,
    })));

    // 玩家状态：先清空，再批量写入快照值。
    clearSessionPersonaStateValues(sessionId);
    upsertSessionPersonaStateValues(sessionId, worldId, Object.entries(snapshot.persona ?? {}).map(([fieldKey, runtimeValueJson]) => ({
      fieldKey,
      runtimeValueJson,
    })));

    // 只替换本次会话中的角色状态，其他角色状态保持不变。
    clearSessionCharacterStateValuesByCharacterIds(sessionId, characterIds);
    const characterValues = [];
    for (const characterId of characterIds) {
      const state = snapshot.character?.[characterId];
      if (!state) continue;
      for (const [fieldKey, runtimeValueJson] of Object.entries(state)) {
        characterValues.push({ characterId, fieldKey, runtimeValueJson });
      }
    }
    upsertSessionCharacterStateValues(sessionId, characterValues);

    // 删除旧行以级联清理状态值，再按快照重建 nearby 并批量写入状态。
    deleteNearbyBySessionId(sessionId);
    const nearbyArr = Array.isArray(snapshot.nearby) ? snapshot.nearby : [];
    const validNearby = nearbyArr.filter((nearby) => nearby && typeof nearby.name === 'string' && nearby.name);
    const nearbyIds = createNearbyCharacters(validNearby.map((nearby) => ({
      sessionId,
      name: nearby.name,
      persona: nearby.persona ?? nearby.memory ?? '',
      isSaved: nearby.is_saved ? 1 : 0,
    })));
    const nearbyValues = [];
    for (let index = 0; index < validNearby.length; index++) {
      const state = validNearby[index].state ?? {};
      for (const [fieldKey, valueJson] of Object.entries(state)) {
        nearbyValues.push({ sessionId, nearbyId: nearbyIds[index], fieldKey, valueJson });
      }
    }
    upsertNearbyStateValues(nearbyValues);
  });
}
