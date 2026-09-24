// 世界 Prompt 条目。
//
// 后端补齐：所属世界、未写 trigger 时按有无 conditions / keywords 推断、排序与默认参数；
// 校验触发类型所需内容齐全、条件引用的字段真实存在。

import { getWorldEntryById, getAllWorldEntries } from '../../../backend/db/queries/prompt-entries.js';
import { listConditionsByEntry } from '../../../backend/db/queries/entry-conditions.js';

import {
  normalizeProposal, applyProposal, buildWorldConditionContext, resolveConditionField,
} from '../normalize-proposal.js';
import { compact, fail, pickKnown, requireObjectKeys, requireText } from './common.js';

export const ENTRY_FIELDS = [
  'title', 'content', 'trigger', 'description', 'keywords', 'keyword_logic', 'keyword_scope',
  'active_turns', 'token', 'conditions', 'condition_logic',
];
const TRIGGERS = ['always', 'keyword', 'llm', 'state'];
const KEYWORD_SCOPES = { user: 'user', assistant: 'assistant', both: 'user,assistant' };

export function loadEntry(id) {
  const entry = getWorldEntryById(id);
  if (!entry) fail(`条目 entry:${id} 不存在；read("entries") 查看当前世界条目`);
  return entry;
}

function conditionsOf(entry) {
  return listConditionsByEntry(entry.id).map((c) => ({ field: c.target_field, op: c.operator, value: c.value }));
}

export function viewEntry(entry) {
  const isKeyword = entry.trigger_type === 'keyword';
  const isState = entry.trigger_type === 'state';
  return compact({
    ref: `entry:${entry.id}`,
    title: entry.title,
    trigger: entry.trigger_type,
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

export function listEntries(worldId) {
  return getAllWorldEntries(worldId).map((e) => compact({
    ref: `entry:${e.id}`,
    title: e.title,
    trigger: e.trigger_type,
    keywords: e.trigger_type === 'keyword' ? e.keywords : undefined,
  }));
}

function inferTrigger(data) {
  if (Array.isArray(data.conditions) && data.conditions.length > 0) return 'state';
  if (Array.isArray(data.keywords) && data.keywords.length > 0) return 'keyword';
  return 'always';
}

// 最终状态（当前值 + 本次修改）必须能触发，否则条目永远不会生效。
function assertTriggerComplete(final) {
  if (!TRIGGERS.includes(final.trigger)) fail(`trigger 只能是 ${TRIGGERS.join(' / ')}`);
  if (final.trigger === 'keyword' && !(final.keywords?.length > 0)) fail('trigger=keyword 需要非空 keywords');
  if (final.trigger === 'state' && !(final.conditions?.length > 0)) fail('trigger=state 需要非空 conditions');
  if (final.trigger === 'llm' && !String(final.description ?? '').trim()) {
    fail('trigger=llm 需要 description（模型据此判断何时注入）');
  }
}

function assertConditionFields(worldId, conditions) {
  if (!Array.isArray(conditions)) return;
  const context = buildWorldConditionContext(worldId);
  for (const c of conditions) {
    if (!c || typeof c !== 'object' || !c.field || !c.op || !('value' in c)) {
      fail('conditions 每项需要 { field, op, value }');
    }
    const { field } = resolveConditionField(c.field, context);
    if (!field) {
      const available = [...context.byScopedLabel.keys()].join('、') || '（无）';
      fail(`条件字段 "${c.field}" 不存在。可用字段：${available}`);
    }
  }
}

function toEntryOp(data) {
  const op = {};
  for (const key of ['title', 'content', 'description', 'keywords', 'keyword_logic', 'active_turns', 'token', 'condition_logic']) {
    if (key in data) op[key] = data[key];
  }
  if ('trigger' in data) op.trigger_type = data.trigger;
  if ('keyword_scope' in data) {
    const scope = KEYWORD_SCOPES[data.keyword_scope];
    if (!scope) fail('keyword_scope 只能是 user / assistant / both');
    op.keyword_scope = scope;
  }
  if ('conditions' in data) {
    op.conditions = (data.conditions ?? []).map((c) => ({ target_field: c.field, operator: c.op, value: String(c.value ?? '') }));
  }
  return op;
}

async function applyEntryOps(worldId, entryOps) {
  return applyProposal(normalizeProposal({ type: 'world-card', operation: 'update', entityId: worldId, entryOps }));
}

export async function createEntry(worldId, data) {
  const input = pickKnown(data, ENTRY_FIELDS, 'entry');
  requireText(input.title, 'title');
  requireText(input.content, 'content');
  const trigger = input.trigger ?? inferTrigger(input);
  assertTriggerComplete({ ...input, trigger });
  assertConditionFields(worldId, input.conditions);
  const result = await applyEntryOps(worldId, [{ op: 'create', ...toEntryOp({ ...input, trigger }) }]);
  const id = result.createdEntryIds[0];
  return `已创建 entry:${id}（${input.title}，trigger=${trigger}）`;
}

export async function updateEntry(id, data) {
  const input = pickKnown(data, ENTRY_FIELDS, 'entry');
  requireObjectKeys(input, 'entry 没有要修改的字段');
  const entry = loadEntry(id);
  const current = {
    trigger: entry.trigger_type,
    keywords: entry.keywords,
    description: entry.description,
    conditions: entry.trigger_type === 'state' ? conditionsOf(entry) : [],
  };
  // 给常驻条目补关键词 / 给非状态条目补条件时，顺带切换触发类型，否则新内容不会生效。
  if (!('trigger' in input)) {
    if (input.conditions?.length > 0 && current.trigger !== 'state') input.trigger = 'state';
    else if (input.keywords?.length > 0 && current.trigger === 'always') input.trigger = 'keyword';
  }
  assertTriggerComplete({ ...current, ...input });
  assertConditionFields(entry.world_id, input.conditions);
  await applyEntryOps(entry.world_id, [{ op: 'update', id, ...toEntryOp(input) }]);
  return `已更新 entry:${id}`;
}

export async function removeEntry(id) {
  const entry = loadEntry(id);
  await applyEntryOps(entry.world_id, [{ op: 'delete', id }]);
  return `已删除 entry:${id}（${entry.title}）`;
}
