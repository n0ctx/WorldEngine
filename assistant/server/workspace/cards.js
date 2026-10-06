// 角色卡（{{char}}）与玩家卡（{{user}}），以及两者的初始状态值。
//
// 后端补齐：所属世界、新玩家卡设为当前激活、状态值按字段标签或 key 定位并按字段类型转换校验。

import { getCharacterById, getCharactersByWorldId } from '../../../backend/db/queries/characters.js';
import { getPersonaById, getPersonaByWorldId, getPersonasByWorldId } from '../../../backend/db/queries/personas.js';
import { deletePersonaService } from '../../../backend/services/personas.js';
import { getCharacterStateValuesWithFields } from '../../../backend/db/queries/character-state-values.js';
import { getPersonaStateValuesWithFieldsByPersonaId } from '../../../backend/db/queries/persona-state-values.js';
import { validateStateValue } from '../../../backend/services/state-values.js';

import { normalizeProposal } from '../normalize-proposal.js';
import { applyProposal } from '../apply-proposal.js';
import { applyProfileValues, assertProfileValues, profileView } from '../profile-defaults.js';
import {
  applyListPatch, compact, fail, isListPatch, parseFields, parseStoredValue, requireObjectKeys, requireText,
} from './common.js';
import { object, text } from './coerce.js';
import { fieldRowsWithPending } from './fields.js';
import { applyStep } from './step.js';

const CHARACTER_SPEC = {
  name: text, description: text, system_prompt: text, post_prompt: text, first_message: text, profile: object, state: object,
};
const PERSONA_SPEC = { name: text, description: text, system_prompt: text, profile: object, state: object };
export const CHARACTER_FIELDS = Object.keys(CHARACTER_SPEC);
export const PERSONA_FIELDS = Object.keys(PERSONA_SPEC);

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
  const active = getPersonaByWorldId(worldId);
  if (!active) fail('当前世界还没有玩家卡；先 create persona 新建一张');
  return active;
}

function stateView(rows) {
  const state = {};
  for (const row of rows) state[row.label] = parseStoredValue(row.type, row.default_value_json);
  return state;
}

const characterState = (character) => stateView(getCharacterStateValuesWithFields(character.id));
const personaState = (persona) => stateView(getPersonaStateValuesWithFieldsByPersonaId(persona.id, persona.world_id));

export function viewCharacter(character) {
  return compact({
    ref: `character:${character.id}`,
    world: `world:${character.world_id}`,
    name: character.name,
    description: character.description,
    system_prompt: character.system_prompt,
    post_prompt: character.post_prompt,
    first_message: character.first_message,
    profile: profileView(character.world_id, 'character', character.profile_defaults_json),
    state: characterState(character),
  });
}

export function viewPersona(persona) {
  return compact({
    ref: `persona:${persona.id}`,
    world: `world:${persona.world_id}`,
    name: persona.name,
    description: persona.description,
    system_prompt: persona.system_prompt,
    profile: profileView(persona.world_id, 'player', persona.profile_defaults_json),
    state: personaState(persona),
  });
}

export function listCharacters(worldId) {
  return getCharactersByWorldId(worldId).map((c) => `character:${c.id} ${c.name}`);
}

export function listPersonaRefs(worldId) {
  return getPersonasByWorldId(worldId).map((p) => `persona:${p.id} ${p.name || '(未命名)'}${p.is_active ? '（当前激活）' : ''}`);
}

// { 字段标签或 key: 原生值 } → 已校验的 stateValueOps。
// currentState 是卡片现有的状态值（按标签）：list 字段写成 { add, remove } 时在它的基础上增删。
function toStateValueOps(worldId, target, values, ctx, currentState = {}) {
  const fields = fieldRowsWithPending(worldId, target, ctx);
  const describe = () => fields.map((f) => `${f.label}（${f.field_key}，${f.type}）`).join('、') || '（无，请先创建字段）';
  const ops = [];
  for (const [name, given] of Object.entries(values)) {
    const field = fields.find((f) => f.field_key === name)
      ?? fields.find((f) => f.label === name)
      ?? fields.find((f) => f.field_key === `${name}${target === 'persona' ? '_user' : '_char'}`);
    if (!field) fail(`${target === 'persona' ? '玩家' : '角色'}层没有字段 "${name}"。可用字段：${describe()}`);
    const value = field.type === 'list' && isListPatch(given) ? applyListPatch(currentState[field.label], given, field.label) : given;
    const validated = validateStateValue(value, field);
    if (validated === undefined) {
      const options = field.type === 'enum' ? `，可选：${(field.enum_options ?? []).join('、')}` : '';
      fail(`字段 ${field.label} 的值 ${JSON.stringify(value)} 不符合类型 ${field.type}${options}`);
    }
    ops.push({ target, field_key: field.field_key, value_json: validated === null ? null : JSON.stringify(validated) });
  }
  return ops;
}

function splitCardValues(input) {
  const { state, profile, ...changes } = input;
  return { state, profile, changes };
}

export function planCreateCharacter(worldId, data, ctx) {
  const { state, profile, changes } = splitCardValues(parseFields(data, CHARACTER_SPEC, 'character'));
  requireText(changes.name, 'name');
  assertProfileValues(worldId, 'character', profile);
  const stateValueOps = state ? toStateValueOps(worldId, 'character', state, ctx) : [];
  const proposal = normalizeProposal({
    type: 'character-card', operation: 'create', changes: { ...changes, world_id: worldId }, stateValueOps,
  });
  return async () => {
    const character = await applyProposal(proposal, worldId);
    applyProfileValues('character', character.id, worldId, 'character', profile);
    return `已创建 character:${character.id}（${character.name}）`;
  };
}

export function planUpdateCharacter(id, data, ctx) {
  const { state, profile, changes } = splitCardValues(parseFields(data, CHARACTER_SPEC, 'character'));
  const character = loadCharacter(id);
  const worldId = character.world_id;
  assertProfileValues(worldId, 'character', profile, character.profile_defaults_json);
  const stateValueOps = state ? toStateValueOps(worldId, 'character', state, ctx, characterState(character)) : [];
  requireObjectKeys({ ...changes, ...(stateValueOps.length ? { state } : {}), ...(profile ? { profile } : {}) }, 'character 没有要修改的字段');
  const hasCardChanges = Object.keys(changes).length > 0 || stateValueOps.length > 0;
  const proposal = hasCardChanges
    ? normalizeProposal({ type: 'character-card', operation: 'update', entityId: id, changes, stateValueOps })
    : null;
  return async () => {
    if (proposal) await applyProposal(proposal);
    applyProfileValues('character', id, worldId, 'character', profile, character.profile_defaults_json);
    return `已更新 character:${id}`;
  };
}

export function planRemoveCharacter(id) {
  const character = loadCharacter(id);
  const proposal = normalizeProposal({ type: 'character-card', operation: 'delete', entityId: id });
  return applyStep(proposal, `已删除 character:${id}（${character.name}）`);
}

const isBlankPersona = (p) => !p.name?.trim() && !p.description?.trim() && !p.system_prompt?.trim();
const ACTIVATED = '，并设为当前激活玩家卡';

export function planCreatePersona(worldId, data, ctx) {
  const { state, profile, changes } = splitCardValues(parseFields(data, PERSONA_SPEC, 'persona'));
  requireText(changes.name, 'name');
  // 新世界自带一张空白玩家卡：只有它一张时直接填写，避免留下多余的空卡。同一批里只有第一张新卡用它。
  const existing = getPersonasByWorldId(worldId);
  if (existing.length === 1 && isBlankPersona(existing[0]) && !ctx.claimed.has(existing[0].id)) {
    ctx.claimed.add(existing[0].id);
    const fill = planUpdatePersona(existing[0], data, ctx);
    return async () => {
      await fill();
      return `已创建 persona:${existing[0].id}（${changes.name}）${ACTIVATED}`;
    };
  }
  assertProfileValues(worldId, 'player', profile);
  const stateValueOps = state ? toStateValueOps(worldId, 'persona', state, ctx) : [];
  const proposal = normalizeProposal({
    type: 'persona-card', operation: 'create', entityId: worldId, changes: { ...changes, world_id: worldId }, stateValueOps,
  });
  return async () => {
    const persona = await applyProposal(proposal);
    applyProfileValues('persona', persona.id, worldId, 'player', profile);
    return `已创建 persona:${persona.id}（${persona.name}）${ACTIVATED}`;
  };
}

export function planUpdatePersona(persona, data, ctx) {
  const { state, profile, changes } = splitCardValues(parseFields(data, PERSONA_SPEC, 'persona'));
  const worldId = persona.world_id;
  assertProfileValues(worldId, 'player', profile, persona.profile_defaults_json);
  const stateValueOps = state ? toStateValueOps(worldId, 'persona', state, ctx, personaState(persona)) : [];
  requireObjectKeys({ ...changes, ...(stateValueOps.length ? { state } : {}), ...(profile ? { profile } : {}) }, 'persona 没有要修改的字段');
  const hasCardChanges = Object.keys(changes).length > 0 || stateValueOps.length > 0;
  const proposal = hasCardChanges
    ? { ...normalizeProposal({ type: 'persona-card', operation: 'update', entityId: worldId, changes, stateValueOps }), personaId: persona.id }
    : null;
  return async () => {
    if (proposal) await applyProposal(proposal);
    applyProfileValues('persona', persona.id, worldId, 'player', profile, persona.profile_defaults_json);
    return `已更新 persona:${persona.id}`;
  };
}

// 每个世界至少保留一张玩家卡；同一批里已排定删除的也算在内。
export function planRemovePersona(persona, ctx) {
  const worldId = persona.world_id;
  const remaining = getPersonasByWorldId(worldId).filter((p) => !ctx.claimed.has(p.id));
  if (remaining.length <= 1) fail('每个世界至少保留一张玩家卡，不能把它们全部删除');
  ctx.claimed.add(persona.id);
  return async () => {
    await deletePersonaService(persona.id);
    const active = getPersonaByWorldId(worldId);
    const note = active ? `；当前玩家卡是 persona:${active.id}（${active.name || '未命名'}）` : '';
    return `已删除 persona:${persona.id}（${persona.name || '未命名'}）${note}`;
  };
}
