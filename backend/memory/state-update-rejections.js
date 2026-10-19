/**
 * state-update-rejections.js — 把一轮状态整理里没写入的改动整理成状态面板可读的条目
 *
 * 每条为 { summary, reason }：summary 说明是哪类改动、改的是谁的哪一项，reason 是被拒原因。
 */

import { listCurrentEntities } from '../db/queries/state-memory.js';
import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import { getProfileFieldDefinitions } from './state-memory-schema.js';
import { buildEntityIndex, resolveEntityRef } from './state-memory-apply.js';

const OP_LABELS = {
  create_entity: '新建实体',
  fill_profile: '补全档案',
  update_profile: '修改档案',
  list_add: '档案追加',
  list_remove: '档案移除',
  correct_profile: '修正档案',
  rename: '改名',
  add_alias: '加别名',
  set_state: '设置动态状态',
  clear_state: '清除动态状态',
  upsert_relation: '记录关系',
  retire_relation: '撤销关系',
  open_thread: '新建事项',
  update_thread: '更新事项',
  resolve_thread: '了结事项',
  retire_entity: '实体退场',
  set_world: '设置世界档案',
};

const WORLD_PROFILE_LABELS = { time: '时间', location: '地点' };

function joinSummary(parts) {
  return parts.filter((part) => typeof part === 'string' && part.trim()).join(' · ');
}

function findEntity(ref, index) {
  const entityId = resolveEntityRef(ref, index);
  return entityId ? index.byId.get(entityId) : null;
}

function entityLabel(ref, index) {
  return findEntity(ref, index)?.name ?? (typeof ref === 'string' ? ref : null);
}

function profileFieldLabel(ref, fieldKey, index) {
  const entity = findEntity(ref, index);
  const field = entity ? getProfileFieldDefinitions(entity.type).find((item) => item.key === fieldKey) : null;
  return field?.label ?? fieldKey;
}

function describeMemoryOp(op, index) {
  if (!op || typeof op !== 'object' || typeof op.op !== 'string') return '格式无效的操作';
  const label = OP_LABELS[op.op] ?? `未知操作 ${op.op}`;
  switch (op.op) {
    case 'create_entity': return joinSummary([label, op.name]);
    case 'upsert_relation': return joinSummary([label, entityLabel(op.subject, index), op.predicate]);
    case 'open_thread':
    case 'update_thread': return joinSummary([label, op.content]);
    case 'set_world': return joinSummary([label, WORLD_PROFILE_LABELS[op.key] ?? op.key]);
    case 'set_state':
    case 'clear_state': return joinSummary([label, entityLabel(op.entity, index), op.key]);
    default: return joinSummary([label, entityLabel(op.entity, index), op.field && profileFieldLabel(op.entity, op.field, index)]);
  }
}

/**
 * @param {object} rejections
 * @param {{ target: string, field: object }[]} rejections.fieldDrops      世界 / 角色 / 玩家字段校验未通过
 * @param {{ op: object, reason: string }[]} rejections.memoryRejected    状态记忆操作被拒
 * @param {{ ref: string, fieldKey?: string, reason: string }[]} rejections.entityFieldsRejected  NPC 字段被拒
 * @param {string[]} rejections.unresolvedPresence  在场名单里解析不到的引用
 * @returns {{ summary: string, reason: string }[]}
 */
export function describeStateUpdateRejections(sessionId, worldId, {
  fieldDrops, memoryRejected, entityFieldsRejected, unresolvedPresence,
}) {
  const index = buildEntityIndex(listCurrentEntities(sessionId));
  const npcFieldLabels = new Map(getCharacterStateFieldsByWorldId(worldId).map((field) => [field.field_key, field.label]));
  return [
    ...fieldDrops.map(({ target, field }) => ({
      summary: joinSummary(['更新状态', target, field.label || field.field_key]),
      reason: '值不符合字段要求',
    })),
    ...memoryRejected.map(({ op, reason }) => ({ summary: describeMemoryOp(op, index), reason })),
    ...entityFieldsRejected.map(({ ref, fieldKey, reason }) => ({
      summary: joinSummary(['更新 NPC 状态', entityLabel(ref, index), fieldKey && (npcFieldLabels.get(fieldKey) || fieldKey)]),
      reason,
    })),
    ...unresolvedPresence.map((ref) => ({
      summary: joinSummary(['在场名单', typeof ref === 'string' ? ref : JSON.stringify(ref)]),
      reason: '找不到这个实体',
    })),
  ];
}
