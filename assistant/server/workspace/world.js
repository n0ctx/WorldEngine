// 世界卡基础信息，以及读取世界时附带的目录（条目 / 字段 / 角色 / 玩家卡）。

import { getAllWorlds } from '../../../backend/db/queries/worlds.js';
import { getWorldById } from '../../../backend/services/worlds.js';
import { getAllWorldEntries } from '../../../backend/db/queries/prompt-entries.js';

import { normalizeProposal, applyProposal } from '../normalize-proposal.js';
import { compact, fail, pickKnown, requireObjectKeys, requireText } from './common.js';
import { listFieldRows, fieldRef } from './fields.js';
import { listCharacters, listPersonaRefs } from './cards.js';
import { FIELD_TARGETS } from './refs.js';

export const WORLD_FIELDS = ['name', 'description', 'temperature', 'max_tokens'];

export function loadWorld(worldId) {
  const world = getWorldById(worldId);
  if (!world) fail(`世界 ${worldId} 不存在；read("worlds") 查看全部世界`);
  return world;
}

export function viewWorld(worldId) {
  const world = loadWorld(worldId);
  const fields = {};
  for (const target of FIELD_TARGETS) {
    fields[target] = listFieldRows(worldId, target).map((f) => `${fieldRef(target, f.field_key)} ${f.label}（${f.type}）`);
  }
  return compact({
    ref: `world:${world.id}`,
    name: world.name,
    description: world.description,
    temperature: world.temperature,
    max_tokens: world.max_tokens,
    entries: getAllWorldEntries(worldId).map((e) => `entry:${e.id} ${e.title}（${e.trigger_type}）`),
    fields,
    characters: listCharacters(worldId),
    personas: listPersonaRefs(worldId),
  });
}

export function listWorlds() {
  return getAllWorlds().map((w) => `world:${w.id} ${w.name}`);
}

export async function createWorld(session, data) {
  const changes = pickKnown(data, WORLD_FIELDS, 'world');
  requireText(changes.name, 'name（世界名）');
  const world = await applyProposal(normalizeProposal({ type: 'world-card', operation: 'create', changes }));
  session.worldId = world.id;
  return `已创建 world:${world.id}（${world.name}），之后的操作默认作用于这个世界。新世界已自带默认状态字段，read("world") 可查看`;
}

export async function updateWorld(worldId, data) {
  const changes = pickKnown(data, WORLD_FIELDS, 'world');
  requireObjectKeys(changes, 'world 没有要修改的字段');
  loadWorld(worldId);
  await applyProposal(normalizeProposal({ type: 'world-card', operation: 'update', entityId: worldId, changes }));
  return `已更新 world:${worldId}`;
}

export async function removeWorld(session, worldId) {
  const world = loadWorld(worldId);
  await applyProposal(normalizeProposal({ type: 'world-card', operation: 'delete', entityId: worldId }));
  if (session.worldId === worldId) session.worldId = null;
  return `已删除 world:${worldId}（${world.name}）`;
}
