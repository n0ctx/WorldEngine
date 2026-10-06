// 世界 Prompt 条目。
//
// 后端补齐：所属世界、未写 trigger 时按有无 conditions / keywords 推断、默认参数；
// 校验触发类型所需内容齐全、条件引用的字段真实存在（含同一批里即将新建的字段）。

import { getWorldEntryById, getAllWorldEntries } from '../../../backend/db/queries/prompt-entries.js';
import { listConditionsByEntry } from '../../../backend/db/queries/entry-conditions.js';
import { updateWorldPromptEntry, reorderWorldPromptEntries } from '../../../backend/services/prompt-entries.js';

import { normalizeProposal } from '../normalize-proposal.js';
import { applyProposal } from '../apply-proposal.js';
import { CONDITION_OPERATORS, buildWorldConditionContext, resolveConditionField } from '../proposal-entry-ops.js';
import { compact, fail, parseFields, requireObjectKeys, requireText } from './common.js';
import { bool, intAtLeast, oneOf, stringList, text } from './coerce.js';
import { pendingFieldOps } from './fields.js';
import { applyStep } from './step.js';

const TRIGGERS = ['always', 'keyword', 'llm', 'state'];
const KEYWORD_SCOPES = { user: 'user', assistant: 'assistant', both: 'user,assistant' };
const LOGIC = oneOf(['AND', 'OR'], { upper: true });
const CONDITION_EXAMPLE = '[{ field: "玩家.生命", op: "<", value: 30 }]';

// 单个条件对象当成只有一项的列表；每项必须是 { field, op, value }。
function conditionList(value, name) {
  if (value == null) return [];
  const items = Array.isArray(value) ? value : [value];
  for (const c of items) {
    if (!c || typeof c !== 'object' || Array.isArray(c) || !c.field || !c.op || !('value' in c)) {
      fail(`${name} 每项需要 { field, op, value }，如 ${CONDITION_EXAMPLE}`);
    }
    if (!CONDITION_OPERATORS.includes(String(c.op).trim())) {
      fail(`条件运算符 "${c.op}" 不支持，可用：${CONDITION_OPERATORS.join(' ')}`);
    }
  }
  return items;
}

const ENTRY_SPEC = {
  title: text,
  content: text,
  trigger: oneOf(TRIGGERS),
  description: text,
  keywords: stringList,
  keyword_logic: LOGIC,
  keyword_scope: oneOf(Object.keys(KEYWORD_SCOPES)),
  active_turns: intAtLeast(0),
  token: intAtLeast(1),
  conditions: conditionList,
  condition_logic: LOGIC,
  enabled: bool,
  order: intAtLeast(1),
};
export const ENTRY_FIELDS = Object.keys(ENTRY_SPEC);
const PROPOSAL_KEYS = ['title', 'content', 'description', 'keywords', 'keyword_logic', 'active_turns', 'token', 'condition_logic'];
const conditionKey = (c) => JSON.stringify([c.field, c.op, String(c.value)]);
const CONDITION_PATCH = {
  keyOf: conditionKey,
  // remove 可只写字段名，或写 { field, op?, value? } 进一步限定
  matches: (c, target) => (typeof target === 'string'
    ? c.field === target
    : c.field === target?.field
      && (target.op === undefined || c.op === target.op)
      && (target.value === undefined || String(c.value) === String(target.value))),
};

export function loadEntry(id) {
  const entry = getWorldEntryById(id);
  if (!entry) fail(`条目 entry:${id} 不存在；read("entries") 查看当前世界条目`);
  return entry;
}

function conditionsOf(entry) {
  return listConditionsByEntry(entry.id).map((c) => ({ field: c.target_field, op: c.operator, value: c.value }));
}

const isDisabled = (entry) => entry.enabled === 0 || entry.enabled === false;

export function viewEntry(entry) {
  const isKeyword = entry.trigger_type === 'keyword';
  const isState = entry.trigger_type === 'state';
  return compact({
    ref: `entry:${entry.id}`,
    title: entry.title,
    trigger: entry.trigger_type,
    order: getAllWorldEntries(entry.world_id).findIndex((e) => e.id === entry.id) + 1,
    enabled: isDisabled(entry) ? false : undefined,
    description: entry.description,
    keywords: isKeyword ? entry.keywords : undefined,
    keyword_logic: isKeyword && entry.keyword_logic === 'AND' ? 'AND' : undefined,
    keyword_scope: isKeyword && entry.keyword_scope !== 'user,assistant' ? entry.keyword_scope : undefined,
    active_turns: isKeyword && entry.active_turns !== 1 ? entry.active_turns : undefined,
    token: entry.token !== 1 ? entry.token : undefined,
    conditions: isState ? conditionsOf(entry) : undefined,
    condition_logic: isState && entry.condition_logic === 'OR' ? 'OR' : undefined,
    content: entry.content,
  });
}

/** 条目目录，按生效顺序排列 */
export function listEntries(worldId) {
  return getAllWorldEntries(worldId).map((e) => compact({
    ref: `entry:${e.id}`,
    title: e.title,
    trigger: e.trigger_type,
    enabled: isDisabled(e) ? false : undefined,
    keywords: e.trigger_type === 'keyword' ? e.keywords : undefined,
  }));
}

function inferTrigger(data) {
  if (data.conditions?.length > 0) return 'state';
  if (data.keywords?.length > 0) return 'keyword';
  return 'always';
}

// 最终状态（当前值 + 本次修改）必须能触发，否则条目永远不会生效。
function assertTriggerComplete(final) {
  if (final.trigger === 'keyword' && !(final.keywords?.length > 0)) fail('trigger=keyword 需要非空 keywords');
  if (final.trigger === 'state' && !(final.conditions?.length > 0)) fail('trigger=state 需要非空 conditions');
  if (final.trigger === 'llm' && !String(final.description ?? '').trim()) {
    fail('trigger=llm 需要 description（模型据此判断何时注入）');
  }
}

function assertConditionFields(worldId, conditions, ctx) {
  if (!conditions?.length) return;
  const context = buildWorldConditionContext(worldId, pendingFieldOps(worldId, ctx));
  for (const c of conditions) {
    const { field } = resolveConditionField(c.field, context);
    if (!field) {
      const available = [...context.byScopedLabel.keys()].join('、') || '（无）';
      fail(`条件字段 "${c.field}" 不存在。可用字段：${available}`);
    }
  }
}

function toEntryOp(data) {
  const op = {};
  for (const key of PROPOSAL_KEYS) {
    if (key in data) op[key] = data[key];
  }
  if ('trigger' in data) op.trigger_type = data.trigger;
  if ('keyword_scope' in data) op.keyword_scope = KEYWORD_SCOPES[data.keyword_scope];
  if ('conditions' in data) {
    op.conditions = data.conditions.map((c) => ({ target_field: c.field, operator: String(c.op).trim(), value: String(c.value ?? '') }));
  }
  return op;
}

// 同一批里即将新建的字段只用于校验条件引用，落库时由它们各自的步骤写入。
function entryProposal(worldId, op, ctx) {
  const proposal = normalizeProposal({
    type: 'world-card', operation: 'update', entityId: worldId, entryOps: [op], stateFieldOps: pendingFieldOps(worldId, ctx),
  });
  return { ...proposal, stateFieldOps: [] };
}

// 启用状态与位置不经提案层，直接走条目服务。
function placeEntry(worldId, id, input) {
  if ('enabled' in input) updateWorldPromptEntry(id, { enabled: input.enabled ? 1 : 0 });
  if (!('order' in input)) return;
  const ids = getAllWorldEntries(worldId).map((e) => e.id).filter((entryId) => entryId !== id);
  ids.splice(Math.min(input.order - 1, ids.length), 0, id);
  reorderWorldPromptEntries(worldId, ids);
}

export function planCreateEntry(worldId, data, ctx) {
  const input = parseFields(data, ENTRY_SPEC, 'entry', { keywords: { current: () => [] }, conditions: { current: () => [], ...CONDITION_PATCH } });
  requireText(input.title, 'title');
  requireText(input.content, 'content');
  const trigger = input.trigger ?? inferTrigger(input);
  assertTriggerComplete({ ...input, trigger });
  assertConditionFields(worldId, input.conditions, ctx);
  const proposal = entryProposal(worldId, { op: 'create', ...toEntryOp({ ...input, trigger }) }, ctx);
  return async () => {
    const { createdEntryIds: [id] } = await applyProposal(proposal);
    placeEntry(worldId, id, input);
    return `已创建 entry:${id}（${input.title}，trigger=${trigger}）`;
  };
}

export function planUpdateEntry(id, data, ctx) {
  const entry = loadEntry(id);
  const current = {
    trigger: entry.trigger_type,
    keywords: entry.keywords,
    description: entry.description,
    conditions: entry.trigger_type === 'state' ? conditionsOf(entry) : [],
  };
  const input = parseFields(data, ENTRY_SPEC, 'entry', {
    keywords: { current: () => current.keywords },
    conditions: { current: () => current.conditions, ...CONDITION_PATCH },
  });
  requireObjectKeys(input, 'entry 没有要修改的字段');
  // 给常驻条目补关键词 / 给非状态条目补条件时，顺带切换触发类型，否则新内容不会生效。
  if (!('trigger' in input)) {
    if (input.conditions?.length > 0 && current.trigger !== 'state') input.trigger = 'state';
    else if (input.keywords?.length > 0 && current.trigger === 'always') input.trigger = 'keyword';
  }
  assertTriggerComplete({ ...current, ...input });
  assertConditionFields(entry.world_id, input.conditions, ctx);
  const op = toEntryOp(input);
  const proposal = Object.keys(op).length > 0 ? entryProposal(entry.world_id, { op: 'update', id, ...op }, ctx) : null;
  return async () => {
    if (proposal) await applyProposal(proposal);
    placeEntry(entry.world_id, id, input);
    return `已更新 entry:${id}${input.trigger && input.trigger !== current.trigger ? `（trigger 改为 ${input.trigger}）` : ''}`;
  };
}

export function planRemoveEntry(id) {
  const entry = loadEntry(id);
  const proposal = normalizeProposal({ type: 'world-card', operation: 'update', entityId: entry.world_id, entryOps: [{ op: 'delete', id }] });
  return applyStep(proposal, `已删除 entry:${id}（${entry.title}）`);
}
