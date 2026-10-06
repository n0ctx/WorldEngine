// 世界卡基础信息，以及读取世界时附带的目录（条目 / 字段 / 角色 / 玩家卡）。

import { getAllWorlds } from '../../../backend/db/queries/worlds.js';
import { getWorldById } from '../../../backend/services/worlds.js';
import { buildNewWorldProfileDefaults, updateWorldProfileDefaults } from '../../../backend/services/world-profile-defaults.js';
import { getAllWorldEntries } from '../../../backend/db/queries/prompt-entries.js';

import { normalizeProposal } from '../normalize-proposal.js';
import { applyProposal } from '../apply-proposal.js';
import { compact, fail, parseFields, requireObjectKeys, requireText } from './common.js';
import { intOrNull, numberOrNull, object, text } from './coerce.js';
import { listFieldRows, fieldRef } from './fields.js';
import { listCharacters, listPersonaRefs } from './cards.js';
import { FIELD_TARGETS } from './refs.js';

const WORLD_SPEC = { name: text, description: text, temperature: numberOrNull, max_tokens: intOrNull, profile: object };
export const WORLD_FIELDS = Object.keys(WORLD_SPEC);

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
  const patch = {};
  for (const [name, raw] of Object.entries(profile)) {
    const key = WORLD_PROFILE_LABELS[name] ?? (name === 'time' || name === 'location' ? name : null);
    if (!key) fail(`世界档案只有时间、地点，不支持 "${name}"`);
    patch[key] = raw;
  }
  return patch;
}

export function planCreateWorld(session, data) {
  const { profile, ...changes } = parseFields(data, WORLD_SPEC, 'world');
  requireText(changes.name, 'name（世界名）');
  if (!profile) fail('建世界必须在 profile 里写开场时间（时间：YYYY-MM-DD 或 YYYY-MM-DDTHH:mm）');
  const profileDefaults = buildNewWorldProfileDefaults(toWorldProfilePatch(profile));
  const proposal = normalizeProposal({ type: 'world-card', operation: 'create', changes });
  return async () => {
    const world = await applyProposal(proposal);
    updateWorldProfileDefaults(world.id, profileDefaults);
    session.worldId = world.id;
    return `已创建 world:${world.id}（${world.name}），之后的操作默认作用于这个世界。新世界已自带默认状态字段，read("world") 可查看`;
  };
}

export function planUpdateWorld(worldId, data) {
  const { profile, ...changes } = parseFields(data, WORLD_SPEC, 'world');
  requireObjectKeys({ ...changes, ...(profile ? { profile } : {}) }, 'world 没有要修改的字段');
  loadWorld(worldId);
  const profilePatch = profile ? toWorldProfilePatch(profile) : null;
  const proposal = Object.keys(changes).length > 0
    ? normalizeProposal({ type: 'world-card', operation: 'update', entityId: worldId, changes })
    : null;
  return async () => {
    // 档案的格式校验在业务层：先写它，校验不过时其余字段还没动。
    if (profilePatch) updateWorldProfileDefaults(worldId, profilePatch);
    if (proposal) await applyProposal(proposal);
    return `已更新 world:${worldId}`;
  };
}

export function planRemoveWorld(session, worldId) {
  const world = loadWorld(worldId);
  const proposal = normalizeProposal({ type: 'world-card', operation: 'delete', entityId: worldId });
  return async () => {
    await applyProposal(proposal);
    if (session.worldId === worldId) session.worldId = null;
    return `已删除 world:${worldId}（${world.name}）`;
  };
}
