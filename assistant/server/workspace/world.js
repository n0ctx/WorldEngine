// 世界卡基础信息，以及读取世界时附带的目录（条目 / 字段 / 角色 / 玩家卡）。

import { getAllWorlds } from '../../../backend/db/queries/worlds.js';
import { getWorldById } from '../../../backend/services/worlds.js';
import { buildNewWorldProfileDefaults, updateWorldProfileDefaults } from '../../../backend/services/world-profile-defaults.js';
import { getAllWorldEntries } from '../../../backend/db/queries/prompt-entries.js';

import { normalizeProposal } from '../normalize-proposal.js';
import { applyProposal } from '../apply-proposal.js';
import { compact, fail, pickKnown, requireObjectKeys, requireText } from './common.js';
import { listFieldRows, fieldRef } from './fields.js';
import { listCharacters, listPersonaRefs } from './cards.js';
import { FIELD_TARGETS } from './refs.js';

export const WORLD_FIELDS = ['name', 'description', 'temperature', 'max_tokens', 'profile'];

function loadWorld(worldId) {
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
    profile: worldProfileView(world.profile_defaults_json),
    entries: getAllWorldEntries(worldId).map((e) => `entry:${e.id} ${e.title}（${e.trigger_type}）`),
    fields,
    characters: listCharacters(worldId),
    personas: listPersonaRefs(worldId),
  });
}

export function listWorlds() {
  return getAllWorlds().map((w) => `world:${w.id} ${w.name}`);
}

const WORLD_PROFILE_LABELS = { 时间: 'time', 开场时间: 'time', 地点: 'location', 开场地点: 'location' };

function worldProfileView(profileDefaultsJson) {
  let parsed = {};
  try { parsed = JSON.parse(profileDefaultsJson || '{}'); } catch { parsed = {}; }
  return compact({ 时间: parsed.time, 地点: parsed.location });
}

function toWorldProfilePatch(profile) {
  if (typeof profile !== 'object' || Array.isArray(profile)) fail('profile 必须是 { 时间, 地点 } 对象');
  const patch = {};
  for (const [name, raw] of Object.entries(profile)) {
    const key = WORLD_PROFILE_LABELS[name] ?? (name === 'time' || name === 'location' ? name : null);
    if (!key) fail(`世界档案只有时间、地点，不支持 "${name}"`);
    patch[key] = raw;
  }
  return patch;
}

function saveWorldProfile(worldId, profile) {
  if (!profile) return;
  updateWorldProfileDefaults(worldId, toWorldProfilePatch(profile));
}

export async function createWorld(session, data) {
  const { profile, ...changes } = pickKnown(data, WORLD_FIELDS, 'world');
  requireText(changes.name, 'name（世界名）');
  if (!profile) fail('建世界必须在 profile 里写开场时间（时间：YYYY-MM-DD 或 YYYY-MM-DDTHH:mm）');
  const profileDefaults = buildNewWorldProfileDefaults(toWorldProfilePatch(profile));
  const world = await applyProposal(normalizeProposal({ type: 'world-card', operation: 'create', changes }));
  updateWorldProfileDefaults(world.id, profileDefaults);
  session.worldId = world.id;
  return `已创建 world:${world.id}（${world.name}），之后的操作默认作用于这个世界。新世界已自带默认状态字段，read("world") 可查看`;
}

export async function updateWorld(worldId, data) {
  const { profile, ...changes } = pickKnown(data, WORLD_FIELDS, 'world');
  requireObjectKeys({ ...changes, ...(profile ? { profile } : {}) }, 'world 没有要修改的字段');
  loadWorld(worldId);
  if (Object.keys(changes).length > 0) {
    await applyProposal(normalizeProposal({ type: 'world-card', operation: 'update', entityId: worldId, changes }));
  }
  saveWorldProfile(worldId, profile);
  return `已更新 world:${worldId}`;
}

export async function removeWorld(session, worldId) {
  const world = loadWorld(worldId);
  await applyProposal(normalizeProposal({ type: 'world-card', operation: 'delete', entityId: worldId }));
  if (session.worldId === worldId) session.worldId = null;
  return `已删除 world:${worldId}（${world.name}）`;
}
