// 角色卡（{{char}}）与玩家卡（{{user}}），以及两者的初始状态值。
//
// 后端补齐：所属世界、新玩家卡设为当前激活、状态值按字段标签或 key 定位并按字段类型转换校验。

import { getCharacterById, getCharactersByWorldId } from '../../../backend/db/queries/characters.js';
import { getPersonaById } from '../../../backend/db/queries/personas.js';
import { getOrCreatePersona, listPersonas } from '../../../backend/services/personas.js';
import { getCharacterStateValuesWithFields } from '../../../backend/db/queries/character-state-values.js';
import { getPersonaStateValuesWithFieldsByPersonaId } from '../../../backend/db/queries/persona-state-values.js';
import { validateStateValue } from '../../../backend/services/state-values.js';

import { normalizeProposal, applyProposal } from '../normalize-proposal.js';
import {
  compact, fail, parseStoredValue, pickKnown, requireObjectKeys, requireText,
} from './common.js';
import { listFieldRows } from './fields.js';

export const CHARACTER_FIELDS = ['name', 'description', 'system_prompt', 'post_prompt', 'first_message', 'state'];
export const PERSONA_FIELDS = ['name', 'description', 'system_prompt', 'state'];

export function loadCharacter(id) {
  const character = getCharacterById(id);
  if (!character) fail(`角色 character:${id} 不存在；read("characters") 查看当前世界角色`);
  return character;
}

// persona 省略 id 时指当前世界的激活玩家卡。
export function loadPersona(ref, worldId) {
  if (ref.id) {
    const persona = getPersonaById(ref.id);
    if (!persona) fail(`玩家卡 persona:${ref.id} 不存在；read("personas") 查看当前世界玩家卡`);
    return persona;
  }
  if (!worldId) fail('当前没有选中世界，无法定位激活玩家卡');
  return getOrCreatePersona(worldId);
}

function stateView(rows) {
  const state = {};
  for (const row of rows) state[row.label] = parseStoredValue(row.type, row.default_value_json);
  return state;
}

export function viewCharacter(character) {
  return compact({
    ref: `character:${character.id}`,
    world: `world:${character.world_id}`,
    name: character.name,
    description: character.description,
    system_prompt: character.system_prompt,
    post_prompt: character.post_prompt,
    first_message: character.first_message,
    state: stateView(getCharacterStateValuesWithFields(character.id)),
  });
}

export function viewPersona(persona) {
  return compact({
    ref: `persona:${persona.id}`,
    world: `world:${persona.world_id}`,
    name: persona.name,
    description: persona.description,
    system_prompt: persona.system_prompt,
    state: stateView(getPersonaStateValuesWithFieldsByPersonaId(persona.id, persona.world_id)),
  });
}

export function listCharacters(worldId) {
  return getCharactersByWorldId(worldId).map((c) => `character:${c.id} ${c.name}`);
}

export function listPersonaRefs(worldId) {
  return listPersonas(worldId).map((p) => `persona:${p.id} ${p.name || '(未命名)'}${p.is_active ? '（当前激活）' : ''}`);
}

// { 字段标签或 key: 原生值 } → 已校验的 stateValueOps。
export function toStateValueOps(worldId, target, values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) fail('state 必须是 { 字段标签或 key: 值 } 对象');
  const fields = listFieldRows(worldId, target);
  const describe = () => fields.map((f) => `${f.label}（${f.field_key}，${f.type}）`).join('、') || '（无，请先创建字段）';
  const ops = [];
  for (const [name, value] of Object.entries(values)) {
    const field = fields.find((f) => f.field_key === name)
      ?? fields.find((f) => f.label === name)
      ?? fields.find((f) => f.field_key === `${name}${target === 'persona' ? '_user' : '_char'}`);
    if (!field) fail(`${target === 'persona' ? '玩家' : '角色'}层没有字段 "${name}"。可用字段：${describe()}`);
    const validated = validateStateValue(value, field);
    if (validated === undefined) {
      const options = field.type === 'enum' ? `，可选：${(field.enum_options ?? []).join('、')}` : '';
      fail(`字段 ${field.label} 的值 ${JSON.stringify(value)} 不符合类型 ${field.type}${options}`);
    }
    ops.push({ target, field_key: field.field_key, value_json: validated === null ? null : JSON.stringify(validated) });
  }
  return ops;
}

function splitState(input) {
  const { state, ...changes } = input;
  return { state, changes };
}

export async function createCharacter(worldId, data) {
  const { state, changes } = splitState(pickKnown(data, CHARACTER_FIELDS, 'character'));
  requireText(changes.name, 'name');
  const stateValueOps = state ? toStateValueOps(worldId, 'character', state) : [];
  const character = await applyProposal(normalizeProposal({
    type: 'character-card', operation: 'create', changes: { ...changes, world_id: worldId }, stateValueOps,
  }), worldId);
  return `已创建 character:${character.id}（${character.name}）`;
}

export async function updateCharacter(id, data) {
  const { state, changes } = splitState(pickKnown(data, CHARACTER_FIELDS, 'character'));
  const character = loadCharacter(id);
  const stateValueOps = state ? toStateValueOps(character.world_id, 'character', state) : [];
  requireObjectKeys({ ...changes, ...(stateValueOps.length ? { state } : {}) }, 'character 没有要修改的字段');
  await applyProposal(normalizeProposal({
    type: 'character-card', operation: 'update', entityId: id, changes, stateValueOps,
  }));
  return `已更新 character:${id}`;
}

export async function removeCharacter(id) {
  const character = loadCharacter(id);
  await applyProposal(normalizeProposal({ type: 'character-card', operation: 'delete', entityId: id }));
  return `已删除 character:${id}（${character.name}）`;
}

const isBlankPersona = (p) => !p.name?.trim() && !p.description?.trim() && !p.system_prompt?.trim();

export async function createPersona(worldId, data) {
  const { state, changes } = splitState(pickKnown(data, PERSONA_FIELDS, 'persona'));
  requireText(changes.name, 'name');
  // 新世界自带一张空白玩家卡：只有它一张时直接填写，避免留下多余的空卡。
  const existing = listPersonas(worldId);
  if (existing.length === 1 && isBlankPersona(existing[0])) {
    await updatePersona(existing[0], data);
    return `已创建 persona:${existing[0].id}（${changes.name}），并设为当前激活玩家卡`;
  }
  const stateValueOps = state ? toStateValueOps(worldId, 'persona', state) : [];
  const persona = await applyProposal(normalizeProposal({
    type: 'persona-card', operation: 'create', entityId: worldId, changes: { ...changes, world_id: worldId }, stateValueOps,
  }));
  return `已创建 persona:${persona.id}（${persona.name}），并设为当前激活玩家卡`;
}

export async function updatePersona(persona, data) {
  const { state, changes } = splitState(pickKnown(data, PERSONA_FIELDS, 'persona'));
  const stateValueOps = state ? toStateValueOps(persona.world_id, 'persona', state) : [];
  requireObjectKeys({ ...changes, ...(stateValueOps.length ? { state } : {}) }, 'persona 没有要修改的字段');
  await applyProposal({
    ...normalizeProposal({ type: 'persona-card', operation: 'update', entityId: persona.world_id, changes, stateValueOps }),
    personaId: persona.id,
  });
  return `已更新 persona:${persona.id}`;
}
