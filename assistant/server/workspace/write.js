// 写入类操作（create / update / set_state / delete）：把每一项分发到对应资源的校验函数，再交给批量执行。

import { fail } from './common.js';
import { parseRef, worldIdOf } from './refs.js';
import { planCreateWorld, planUpdateWorld, planRemoveWorld } from './world.js';
import { planCreateEntry, planUpdateEntry, planRemoveEntry } from './entries.js';
import { planCreateField, planUpdateField, planRemoveField } from './fields.js';
import {
  loadPersona, planCreateCharacter, planUpdateCharacter, planRemoveCharacter,
  planCreatePersona, planUpdatePersona, planRemovePersona,
} from './cards.js';
import {
  planCreateCss, planUpdateCss, planRemoveCss, planCreateRegex, planUpdateRegex, planRemoveRegex,
} from './style.js';
import { planUpdateConfig } from './config.js';
import { runBatch } from './batch.js';
import { MAX_BATCH_ITEMS, MAX_DELETE_REFS } from './limits.js';

export const CREATE_KINDS = ['world', 'entry', 'field', 'character', 'persona', 'css', 'regex'];
// 同一批里的校验与落库顺序：字段先于引用它的条目和卡片。
const KIND_RANK = { field: 0, entry: 1, css: 2, regex: 2, persona: 3, character: 4 };
const rankOfKind = (kind) => KIND_RANK[kind] ?? 5;
const kindOfRef = (rawRef) => String(rawRef ?? '').trim().split(/[:@]/)[0];

// world 可选，指定资源建在哪个世界；省略时用当前世界。
function planCreate(session, { kind, data }, world, ctx) {
  const worldRef = world ? { worldId: String(world).replace(/^world:/, '') } : null;
  const targetWorld = () => worldIdOf(worldRef, session);
  switch (kind) {
    case 'world': return planCreateWorld(session, data);
    case 'entry': return planCreateEntry(targetWorld(), data, ctx);
    case 'field': return planCreateField(targetWorld(), data, ctx);
    case 'character': return planCreateCharacter(targetWorld(), data, ctx);
    case 'persona': return planCreatePersona(targetWorld(), data, ctx);
    case 'css': return planCreateCss(data);
    case 'regex': return planCreateRegex(data, worldRef ? targetWorld() : session.worldId);
    default: return fail(`kind 只能是 ${CREATE_KINDS.join(' / ')}`);
  }
}

export async function createWorkspaceResources(session, items, world) {
  if (Array.isArray(items) && items.length > 1 && items.some((item) => item?.kind === 'world')) {
    fail('world 需要单独创建：先 create world，再用一次 items 建它的字段、条目和卡片');
  }
  return runBatch(items, {
    verb: '已创建',
    max: MAX_BATCH_ITEMS,
    labelOf: (item) => `${item?.kind ?? '?'}${labelOfData(item?.data)}`,
    rankOf: (item) => rankOfKind(item?.kind),
    plan: (item, ctx) => planCreate(session, item ?? {}, world, ctx),
  });
}

function labelOfData(data) {
  const name = data?.name ?? data?.title ?? data?.label;
  return typeof name === 'string' && name ? `「${name}」` : '';
}

function planUpdate(session, { ref: rawRef, data, invalid }, ctx) {
  if (invalid) fail(invalid);
  const ref = parseRef(rawRef);
  if (ref.list) fail('update 需要单个资源的 ref，不能是列表');
  switch (ref.kind) {
    case 'world': return planUpdateWorld(ref.id ?? worldIdOf(ref, session), data);
    case 'entry': return planUpdateEntry(ref.id, data, ctx);
    case 'field': return planUpdateField(worldIdOf(ref, session), ref, data);
    case 'character': return planUpdateCharacter(ref.id, data, ctx);
    case 'persona': return planUpdatePersona(loadPersona(ref, ref.worldId ?? session.worldId), data, ctx);
    case 'css': return planUpdateCss(ref.id, data);
    case 'regex': return planUpdateRegex(ref.id, data, ref.worldId ? worldIdOf(ref, session) : session.worldId);
    case 'config': return planUpdateConfig(data);
    default: return fail(`${ref.kind} 不支持修改`);
  }
}

export function updateWorkspaceResources(session, items) {
  return runBatch(items, {
    verb: '已更新',
    max: MAX_BATCH_ITEMS,
    labelOf: (item) => String(item?.ref ?? '?'),
    rankOf: (item) => rankOfKind(kindOfRef(item?.ref)),
    plan: (item, ctx) => planUpdate(session, item ?? {}, ctx),
  });
}

// set_state 是 update 的 state 字段的专用入口，只接受角色卡与玩家卡。
export async function setWorkspaceStates(session, items) {
  return updateWorkspaceResources(session, items.map((item) => {
    const kind = kindOfRef(item?.ref);
    if (kind !== 'character' && kind !== 'persona') {
      return { ref: item?.ref, invalid: 'set_state 只用于 character:<id> 或 persona[:id]；世界层字段的初始值请用 update field:world.<字段> 的 default' };
    }
    return { ref: item.ref, data: { state: item.values } };
  }));
}

function planRemove(session, rawRef, ctx) {
  const ref = parseRef(rawRef);
  if (ref.list) fail('delete 需要单个资源的 ref，不能是列表');
  switch (ref.kind) {
    case 'world': return planRemoveWorld(session, ref.id ?? worldIdOf(ref, session));
    case 'entry': return planRemoveEntry(ref.id);
    case 'field': return planRemoveField(worldIdOf(ref, session), ref);
    case 'character': return planRemoveCharacter(ref.id);
    case 'persona': return planRemovePersona(loadPersona(ref, ref.worldId ?? session.worldId), ctx);
    case 'css': return planRemoveCss(ref.id);
    case 'regex': return planRemoveRegex(ref.id);
    default: return fail(`${ref.kind} 不支持删除`);
  }
}

export function removeWorkspaceResources(session, refs) {
  return runBatch(refs, {
    verb: '已删除',
    max: MAX_DELETE_REFS,
    labelOf: (rawRef) => String(rawRef ?? '?'),
    plan: (rawRef, ctx) => planRemove(session, rawRef, ctx),
  });
}
