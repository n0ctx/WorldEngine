/**
 * state-rollback.js — 状态快照捕获与回滚
 *
 * 对外暴露：
 *   captureStateSnapshot(sessionId, worldId, characterIds)      → snapshot 对象
 *   restoreStateFromSnapshot(sessionId, worldId, characterIds, snapshot)
 *     snapshot=null 时保留现状（首轮重生成场景：用户手动加的 state 是显式意图，不能清）
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
  upsertEntityStateValues,
  getEntityStateValues,
  clearEntityStateValuesBySession,
} from '../db/queries/session-entity-state-values.js';
import { listCurrentEntities } from '../db/queries/state-memory.js';
import { withSessionStateTransaction } from '../db/queries/session-state-batch.js';

function withoutNullValues(valueMap) {
  return Object.fromEntries(Object.entries(valueMap).filter(([, v]) => v != null));
}

function toStateValueRows(valueMap) {
  return Object.entries(valueMap ?? {}).map(([fieldKey, runtimeValueJson]) => ({
    fieldKey,
    runtimeValueJson,
  }));
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
 * 捕获「完整」快照：三层状态 + 实体字段值层（entityValues）。
 * 与 createTurnRecord 写入 turn record 的快照口径一致，供基线捕获与轮次快照共用。
 *
 * @param {string} sessionId
 * @param {string} worldId
 * @param {string[]} characterIds
 * @returns {{ world: object, persona: object, character: object, entityValues: object }}
 */
export function captureFullSnapshot(sessionId, worldId, characterIds) {
  const snapshot = captureStateSnapshot(sessionId, worldId, characterIds);
  const entityIds = listCurrentEntities(sessionId).map((entity) => entity.entity_id);
  const entityValuesByEntity = getEntityStateValues(sessionId, entityIds);
  snapshot.entityValues = Object.fromEntries(
    entityIds.map((entityId) => [entityId, withoutNullValues(entityValuesByEntity[entityId])]),
  );
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
    // 当前 session state 是用户在首轮前的手动配置，是显式意图，必须保留。
    // 早期实现会清空回 default，导致用户手动配置被静默删除。
    return;
  }

  withSessionStateTransaction(() => {
    // 世界状态：先清空，再批量写入快照值。
    clearSessionWorldStateValues(sessionId);
    upsertSessionWorldStateValues(sessionId, worldId, toStateValueRows(snapshot.world));

    // 玩家状态：先清空，再批量写入快照值。
    clearSessionPersonaStateValues(sessionId);
    upsertSessionPersonaStateValues(sessionId, worldId, toStateValueRows(snapshot.persona));

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

    // 实体字段值：旧快照没有 entityValues 层时不动现状；有则先清空本会话全部实体字段值，
    // 再只写回快照中、且实体仍存在于 state_entities 的值（已被回滚清掉的实体不写回）。
    if (snapshot.entityValues) {
      clearEntityStateValuesBySession(sessionId);
      const currentEntityIds = new Set(listCurrentEntities(sessionId).map((entity) => entity.entity_id));
      const entityValueRows = [];
      for (const [entityId, state] of Object.entries(snapshot.entityValues)) {
        if (!currentEntityIds.has(entityId)) continue;
        for (const [fieldKey, runtimeValueJson] of Object.entries(state ?? {})) {
          entityValueRows.push({ entityId, fieldKey, runtimeValueJson });
        }
      }
      upsertEntityStateValues(sessionId, entityValueRows);
    }
  });
}
