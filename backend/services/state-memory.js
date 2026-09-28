/**
 * state-memory.js — 状态记忆接口的业务逻辑（手动编辑 + 只读聚合）
 *
 * 手动编辑记在「当前最新一轮」（splitRounds 的最后一轮，没有轮次时为 0），
 * 不做证据校验、不受可变性限制，档案行 evidence 写 '手动编辑'。
 *
 * 出错统一抛出 Error 并带 `code`（'not_found' | 'bad_request' | 'conflict'），
 * 供路由层映射到 404 / 400 / 409。
 *
 * 对外接口：
 *   getStateMemory(sessionId) → { entities, relations, threads, facts, world, presentIds }
 *   createEntity(sessionId, { type, name, aliases?, pinned? }) → entity 视图
 *   createEntityFromCard(sessionId, { character_id }) → entity 视图，从角色卡建置顶关联实体
 *     并把该世界 nearby_enabled=1 的字段在该卡片上的默认值复制到实体的用户字段运行时值
 *   updateEntity(sessionId, entityId, { name?, aliases?, pinned?, profile?, dynamic? }) → entity 视图
 *   retireEntity(sessionId, entityId) → entity 视图
 *   updateEntityField(sessionId, entityId, fieldKey, { value }) → entity 视图
 *   updateWorld(sessionId, { time?, location? }) → { time, location, location_entity_id }
 *   createRelation(sessionId, { subject_id, predicate, object_id?, object_value?, note? }) → relation
 *   deleteRelation(sessionId, relationId) → { ok: true }
 *   createThread(sessionId, { kind, participants, content }) → thread
 *   updateThread(sessionId, threadId, { content?, status? }) → thread
 *   createFact(sessionId, { text }) → fact
 *   deleteFact(sessionId, factId) → { ok: true }
 *
 * updateEntity 的三个分支单独导出（供圈复杂度按独立单元计分，也便于单测）：
 *   applyEntityBasicPatch(sessionId, entity, body, round) → void，改名/别名/置顶
 *   applyManualProfilePatch(sessionId, entity, worldId, patch, round) → void，档案字段增删改
 *   applyManualDynamicPatch(sessionId, entity, patch, round) → void，现状（动态状态）增删改
 */

import crypto from 'node:crypto';

import {
  upsertEntity, upsertProfileField, closeProfileField, upsertDynamicState, closeDynamicState,
  upsertRelation, closeRelation, upsertThread, upsertWorldProfile, upsertWorldFact, closeWorldFact,
  nextEntitySeq, nextThreadSeq, nextRelationSeq, nextFactSeq,
  listCurrentEntities, getEntityDetails, listCurrentRelations, listThreads,
  listCurrentWorldFacts, getCurrentWorldProfile, getLatestPresence,
} from '../db/queries/state-memory.js';
import { withSessionStateTransaction } from '../db/queries/session-state-batch.js';
import { getEntityStateValues, upsertEntityStateValues } from '../db/queries/session-entity-state-values.js';
import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import { getSessionById } from '../db/queries/sessions.js';
import { getMessagesBySessionId } from '../db/queries/messages.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getAllCharacterStateValues } from '../db/queries/character-state-values.js';
import { splitRounds } from '../utils/session-rounds.js';
import { parseWorldDate, deriveAge } from '../utils/world-date.js';
import { validateValue } from '../utils/state-field-validate.js';
import { truncateText, truncateListItems, seedProfileDefaults } from '../memory/state-memory-apply.js';
import {
  ENTITY_TYPES, THREAD_KINDS, DYNAMIC_LOCATION_KEY,
  getProfileFieldDefinitions, resolveActiveProfileFields, isPlaceholderValue,
} from '../memory/state-memory-schema.js';
import { STATE_WORLD_FACTS_MAX } from '../utils/constants.js';

const THREAD_STATUSES = ['active', 'resolved', 'failed'];

function serviceError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function requireSession(sessionId) {
  const session = getSessionById(sessionId);
  if (!session) throw serviceError('not_found', '会话不存在');
  return session;
}

function requireEntity(sessionId, entityId) {
  const entity = listCurrentEntities(sessionId).find((e) => e.entity_id === entityId);
  if (!entity) throw serviceError('not_found', '实体不存在');
  return entity;
}

function resolveSessionWorldId(session) {
  return session.world_id ?? getCharacterById(session.character_id)?.world_id ?? null;
}

/** 手动编辑记在当前最新一轮：splitRounds 的最后一轮，没有轮次时为 0。 */
function resolveManualRound(sessionId) {
  const rounds = splitRounds(getMessagesBySessionId(sessionId, null));
  return rounds.at(-1)?.roundIndex ?? 0;
}

function normalizeAliases(aliases) {
  return Array.isArray(aliases) ? aliases.filter((a) => typeof a === 'string' && a.trim()).map((a) => a.trim()) : [];
}

/** 按实体 ID 或完全匹配名字解析地点：能对应到当前 active 的 location 实体时带上其 ID，否则只存文字（不建实体）。 */
function resolveLocationText(entities, rawValue) {
  if (isPlaceholderValue(rawValue)) return null;
  const trimmed = typeof rawValue === 'string' ? rawValue.trim() : '';
  const matched = trimmed
    ? entities.find((e) => e.status === 'active' && (e.entity_id === trimmed || e.name === trimmed))
    : null;
  if (matched && matched.type === 'location') return { text: matched.name, locationEntityId: matched.entity_id };
  const text = truncateText(String(rawValue).trim());
  return text ? { text, locationEntityId: null } : null;
}

// ============================
// 只读聚合：entity 视图
// ============================

function decodeJson(raw) {
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

function buildProfileView(profileDetail) {
  const out = {};
  for (const [key, field] of Object.entries(profileDetail)) {
    out[key] = { value: decodeJson(field.value_json), evidence: field.evidence, round: field.valid_from_round };
  }
  return out;
}

function buildFieldsView(entity, worldCharacterFields, fieldValues) {
  if (entity.type !== 'character') return [];
  return worldCharacterFields.map((field) => {
    const raw = fieldValues[entity.entity_id]?.[field.field_key];
    const source = raw != null ? raw : field.default_value;
    return {
      field_key: field.field_key, label: field.label, type: field.type, update_mode: field.update_mode,
      value: decodeJson(source),
    };
  });
}

function buildEntityViewContext(sessionId, worldId, entityIds, worldProfile) {
  return {
    details: getEntityDetails(sessionId, entityIds),
    fieldValues: getEntityStateValues(sessionId, entityIds),
    worldCharacterFields: worldId ? getCharacterStateFieldsByWorldId(worldId).filter((f) => f.nearby_enabled) : [],
    worldDate: worldProfile.time ? parseWorldDate(worldProfile.time) : null,
    worldId,
  };
}

function buildEntityView(entity, ctx) {
  const detail = ctx.details[entity.entity_id] || { profile: {}, dynamic: {} };
  const profile = buildProfileView(detail.profile);
  const age = deriveAge({ birth_date: profile.birth_date?.value, age_recorded: profile.age_recorded?.value }, ctx.worldDate);
  return {
    entity_id: entity.entity_id,
    seq: entity.seq,
    type: entity.type,
    name: entity.name,
    aliases: decodeJson(entity.aliases_json) ?? [],
    pinned: Boolean(entity.pinned),
    card_id: entity.card_id,
    status: entity.status,
    profile,
    dynamic: detail.dynamic,
    fields: buildFieldsView(entity, ctx.worldCharacterFields, ctx.fieldValues),
    age,
    activeProfileFields: resolveActiveProfileFields(ctx.worldId, entity.type),
  };
}

function getEntityViewById(sessionId, entityId) {
  const session = getSessionById(sessionId);
  const worldId = resolveSessionWorldId(session);
  const entity = requireEntity(sessionId, entityId);
  const worldProfile = getCurrentWorldProfile(sessionId);
  const ctx = buildEntityViewContext(sessionId, worldId, [entityId], worldProfile);
  return buildEntityView(entity, ctx);
}

// ============================
// GET：聚合视图
// ============================

export function getStateMemory(sessionId) {
  const session = requireSession(sessionId);
  const worldId = resolveSessionWorldId(session);
  const allEntities = listCurrentEntities(sessionId);
  const worldProfile = getCurrentWorldProfile(sessionId);
  const ctx = buildEntityViewContext(sessionId, worldId, allEntities.map((e) => e.entity_id), worldProfile);
  const entities = allEntities.map((entity) => buildEntityView(entity, ctx));

  // guard-allow(duplication): 与 daily-entries 路由的行转字段子集是不同领域的巧合同形，不是业务重复
  const facts = listCurrentWorldFacts(sessionId).map((f) => ({
    fact_id: f.fact_id, seq: f.seq, text: f.text, evidence: f.evidence, valid_from_round: f.valid_from_round,
  }));
  const presence = getLatestPresence(sessionId);

  return {
    entities,
    relations: listCurrentRelations(sessionId),
    threads: listThreads(sessionId).map(toThreadView),
    facts,
    world: worldProfile,
    presentIds: presence ? presence.entity_ids : [],
  };
}

// ============================
// 实体：新建 / 改动 / 退场 / 用户字段
// ============================

/** 同名 active 实体已存在时 409。 */
function assertNameAvailable(sessionId, name) {
  const conflict = listCurrentEntities(sessionId).some((e) => e.status === 'active' && e.name === name);
  if (conflict) throw serviceError('conflict', '名字与其他实体重名');
}

/** 新建实体前的公共准备：记在当前最新一轮，分配新 entityId。 */
function beginEntityCreation(sessionId) {
  return { round: resolveManualRound(sessionId), entityId: crypto.randomUUID() };
}

export function createEntity(sessionId, body = {}) {
  requireSession(sessionId);
  if (!ENTITY_TYPES.includes(body.type)) throw serviceError('bad_request', `未知实体类型: ${body.type}`);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) throw serviceError('bad_request', '缺少名字');
  assertNameAvailable(sessionId, name);

  const { round, entityId } = beginEntityCreation(sessionId);
  upsertEntity(sessionId, {
    entityId, seq: nextEntitySeq(sessionId), type: body.type, name,
    aliasesJson: JSON.stringify(normalizeAliases(body.aliases)), pinned: !!body.pinned,
  }, round);
  return getEntityViewById(sessionId, entityId);
}

/** 从角色卡建置顶关联实体（带入卡片的档案初始值）：卡片须属于本会话所在世界；同名 active 实体已存在时 409。 */
export function createEntityFromCard(sessionId, body = {}) {
  const session = requireSession(sessionId);
  const worldId = resolveSessionWorldId(session);
  const characterId = typeof body.character_id === 'string' ? body.character_id.trim() : '';
  if (!characterId) throw serviceError('bad_request', '缺少 character_id');
  const character = getCharacterById(characterId);
  if (!character) throw serviceError('not_found', '角色卡不存在');
  if (character.world_id !== worldId) throw serviceError('bad_request', '角色卡不属于该世界');

  const name = character.name;
  assertNameAvailable(sessionId, name);

  const { round, entityId } = beginEntityCreation(sessionId);
  upsertEntity(sessionId, {
    entityId, seq: nextEntitySeq(sessionId), type: 'character', name,
    aliasesJson: '[]', cardId: characterId, pinned: true,
  }, round);
  seedProfileDefaults(sessionId, {
    entityId, entityType: 'character', worldId, profileDefaultsJson: character.profile_defaults_json, round,
  });

  // 把该世界 nearby_enabled=1 的角色字段在该卡片上的默认值复制到实体的用户字段运行时值
  const fields = worldId ? getCharacterStateFieldsByWorldId(worldId).filter((f) => f.nearby_enabled) : [];
  const enabledKeys = new Set(fields.map((f) => f.field_key));
  const cardValues = getAllCharacterStateValues(characterId);
  upsertEntityStateValues(sessionId, cardValues
    .filter((v) => enabledKeys.has(v.field_key) && v.default_value_json != null)
    .map((v) => ({ entityId, fieldKey: v.field_key, runtimeValueJson: v.default_value_json })));

  return getEntityViewById(sessionId, entityId);
}

export function applyEntityBasicPatch(sessionId, entity, body, round) {
  if (body.name === undefined && body.aliases === undefined && body.pinned === undefined) return;
  let name = entity.name;
  if (body.name !== undefined) {
    name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw serviceError('bad_request', '缺少名字');
    if (name !== entity.name) {
      const conflict = listCurrentEntities(sessionId)
        .some((e) => e.status === 'active' && e.entity_id !== entity.entity_id && e.name === name);
      if (conflict) throw serviceError('conflict', '名字与其他实体重名');
    }
  }
  const aliasesJson = body.aliases !== undefined ? JSON.stringify(normalizeAliases(body.aliases)) : entity.aliases_json;
  const pinned = body.pinned !== undefined ? !!body.pinned : Boolean(entity.pinned);
  upsertEntity(sessionId, {
    entityId: entity.entity_id, seq: entity.seq, type: entity.type, name, aliasesJson,
    cardId: entity.card_id, pinned, status: entity.status,
  }, round);
  entity.name = name;
  entity.aliases_json = aliasesJson;
  entity.pinned = pinned ? 1 : 0;
}

function formatWorldDateShort(worldDate) {
  const mm = String(worldDate.month).padStart(2, '0');
  const dd = String(worldDate.day).padStart(2, '0');
  return `${worldDate.year}-${mm}-${dd}`;
}

function resolveManualProfileFieldDef(entityType, worldId, fieldKey) {
  const fieldDef = getProfileFieldDefinitions(entityType).find((d) => d.key === fieldKey);
  if (!fieldDef) throw serviceError('bad_request', `未知档案字段: ${fieldKey}`);
  if (!resolveActiveProfileFields(worldId, entityType).includes(fieldKey)) {
    throw serviceError('bad_request', `档案字段已停用: ${fieldKey}`);
  }
  return fieldDef;
}

function normalizeManualListValue(fieldDef, value) {
  if (!Array.isArray(value)) throw serviceError('bad_request', `${fieldDef.key} 须为列表`);
  return truncateListItems(value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean));
}

function normalizeManualAgeValue(fieldDef, value, { round, worldDate }) {
  if (typeof value?.age !== 'number') throw serviceError('bad_request', `${fieldDef.key} 格式无效`);
  const recorded = { age: value.age, as_of_round: typeof value.as_of_round === 'number' ? value.as_of_round : round };
  const asOfDate = value.as_of_date ?? (worldDate ? formatWorldDateShort(worldDate) : undefined);
  if (asOfDate) recorded.as_of_date = asOfDate;
  return recorded;
}

function normalizeManualTextValue(fieldDef, value) {
  if (typeof value !== 'string') throw serviceError('bad_request', `${fieldDef.key} 须为文本`);
  const trimmed = value.trim();
  if (fieldDef.key === 'birth_date' && !parseWorldDate(trimmed)) throw serviceError('bad_request', '出生日期格式无效');
  return truncateText(trimmed);
}

export function normalizeManualProfileValue(fieldDef, value, ctx) {
  if (fieldDef.kind === 'list') return normalizeManualListValue(fieldDef, value);
  if (fieldDef.kind === 'age') return normalizeManualAgeValue(fieldDef, value, ctx);
  return normalizeManualTextValue(fieldDef, value);
}

export function applyManualProfilePatch(sessionId, entity, worldId, patch, round) {
  const worldProfile = getCurrentWorldProfile(sessionId);
  const worldDate = worldProfile.time ? parseWorldDate(worldProfile.time) : null;
  // guard-allow(perf-shape): 手动编辑一次改动的档案字段数由用户在界面上勾选，数量很小，不做批量查询
  for (const [fieldKey, rawValue] of Object.entries(patch)) {
    const fieldDef = resolveManualProfileFieldDef(entity.type, worldId, fieldKey);
    if (rawValue === null) {
      closeProfileField(sessionId, entity.entity_id, fieldKey, round);
      continue;
    }
    const value = normalizeManualProfileValue(fieldDef, rawValue, { round, worldDate });
    upsertProfileField(sessionId, entity.entity_id, fieldKey, JSON.stringify(value), '手动编辑', round);
  }
}

export function applyManualDynamicPatch(sessionId, entity, patch, round) {
  const entities = listCurrentEntities(sessionId);
  // guard-allow(perf-shape): 手动编辑一次改动的现状键数由用户在界面上勾选，数量很小，不做批量查询
  for (const [rawKey, rawValue] of Object.entries(patch)) {
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!key) throw serviceError('bad_request', '缺少 key');
    if (rawValue === null) {
      closeDynamicState(sessionId, entity.entity_id, key, round);
      continue;
    }
    if (key === DYNAMIC_LOCATION_KEY) {
      const resolved = resolveLocationText(entities, rawValue);
      if (!resolved) throw serviceError('bad_request', '占位值或地点解析失败');
      upsertDynamicState(sessionId, entity.entity_id, DYNAMIC_LOCATION_KEY, resolved.text, round);
      continue;
    }
    if (typeof rawValue !== 'string' && typeof rawValue !== 'number') {
      throw serviceError('bad_request', `${key} 须为文本`);
    }
    upsertDynamicState(sessionId, entity.entity_id, key, truncateText(String(rawValue).trim()), round);
  }
}

export function updateEntity(sessionId, entityId, body = {}) {
  const session = requireSession(sessionId);
  const entity = requireEntity(sessionId, entityId);
  const worldId = resolveSessionWorldId(session);
  const round = resolveManualRound(sessionId);

  return withSessionStateTransaction(() => {
    applyEntityBasicPatch(sessionId, entity, body, round);
    if (body.profile && typeof body.profile === 'object') {
      applyManualProfilePatch(sessionId, entity, worldId, body.profile, round);
    }
    if (body.dynamic && typeof body.dynamic === 'object') {
      applyManualDynamicPatch(sessionId, entity, body.dynamic, round);
    }
    return getEntityViewById(sessionId, entityId);
  });
}

export function retireEntity(sessionId, entityId) {
  requireSession(sessionId);
  const entity = requireEntity(sessionId, entityId);
  const round = resolveManualRound(sessionId);

  return withSessionStateTransaction(() => {
    upsertEntity(sessionId, {
      entityId: entity.entity_id, seq: entity.seq, type: entity.type, name: entity.name,
      aliasesJson: entity.aliases_json, cardId: entity.card_id, pinned: entity.pinned, status: 'retired',
    }, round);
    // guard-allow(perf-shape): 单个实体退场时要关闭的关系数随单轮剧情而定，数量很小，不做批量查询（与 state-memory-apply.js 的 handleRetireEntity 同形）
    listCurrentRelations(sessionId)
      .filter((r) => r.subject_id === entity.entity_id || r.object_id === entity.entity_id)
      .forEach((relation) => closeRelation(sessionId, relation.relation_id, round));
    return getEntityViewById(sessionId, entityId);
  });
}

export function updateEntityField(sessionId, entityId, fieldKey, body = {}) {
  const session = requireSession(sessionId);
  const entity = requireEntity(sessionId, entityId);
  if (entity.type !== 'character') throw serviceError('bad_request', '只能修改角色实体的用户字段');
  const worldId = resolveSessionWorldId(session);
  const field = getCharacterStateFieldsByWorldId(worldId).find((f) => f.field_key === fieldKey && f.nearby_enabled);
  if (!field) throw serviceError('bad_request', `字段不适用: ${fieldKey}`);
  const validated = validateValue(body.value, field);
  if (validated === undefined) throw serviceError('bad_request', '校验失败');
  upsertEntityStateValues(sessionId, [
    { entityId, fieldKey, runtimeValueJson: validated === null ? null : JSON.stringify(validated) },
  ]);
  return getEntityViewById(sessionId, entityId);
}

// ============================
// 世界档案
// ============================

export function updateWorld(sessionId, body = {}) {
  requireSession(sessionId);
  const round = resolveManualRound(sessionId);

  if (body.time !== undefined) {
    const trimmed = typeof body.time === 'string' ? body.time.trim() : '';
    if (!parseWorldDate(trimmed)) throw serviceError('bad_request', '时间格式无效');
    upsertWorldProfile(sessionId, 'time', trimmed, null, round);
  }
  if (body.location !== undefined) {
    const resolved = resolveLocationText(listCurrentEntities(sessionId), body.location);
    if (!resolved) throw serviceError('bad_request', '占位值或地点解析失败');
    upsertWorldProfile(sessionId, 'location', resolved.text, resolved.locationEntityId, round);
  }
  return getCurrentWorldProfile(sessionId);
}

// ============================
// 关系
// ============================

export function createRelation(sessionId, body = {}) {
  requireSession(sessionId);
  const byId = new Map(listCurrentEntities(sessionId).map((e) => [e.entity_id, e]));
  const subject = byId.get(body.subject_id);
  if (!subject) throw serviceError('not_found', '主体实体不存在');
  const predicate = typeof body.predicate === 'string' ? body.predicate.trim() : '';
  if (!predicate) throw serviceError('bad_request', '缺少谓词');

  let objectId = null;
  let objectValue = null;
  if (body.object_id != null) {
    const object = byId.get(body.object_id);
    if (!object) throw serviceError('not_found', '客体实体不存在');
    objectId = object.entity_id;
  } else if (typeof body.object_value === 'string' && body.object_value.trim()) {
    objectValue = truncateText(body.object_value.trim());
  } else {
    throw serviceError('bad_request', '缺少客体');
  }

  const round = resolveManualRound(sessionId);
  const relationId = crypto.randomUUID();
  const seq = nextRelationSeq(sessionId);
  const note = typeof body.note === 'string' ? body.note : '';
  upsertRelation(sessionId, { relationId, seq, subjectId: subject.entity_id, predicate, objectId, objectValue, note }, round);
  return { relation_id: relationId, seq, subject_id: subject.entity_id, predicate, object_id: objectId, object_value: objectValue, note };
}

export function deleteRelation(sessionId, relationId) {
  requireSession(sessionId);
  const relation = listCurrentRelations(sessionId).find((r) => r.relation_id === relationId);
  if (!relation) throw serviceError('not_found', '关系不存在');
  closeRelation(sessionId, relationId, resolveManualRound(sessionId));
  return { ok: true };
}

// ============================
// 未完结事项
// ============================

function toThreadView(thread) {
  return {
    thread_id: thread.thread_id, seq: thread.seq, kind: thread.kind,
    participants: JSON.parse(thread.participants_json || '[]'), content: thread.content,
    status: thread.status, opened_round: thread.opened_round,
  };
}

export function createThread(sessionId, body = {}) {
  requireSession(sessionId);
  if (!THREAD_KINDS.includes(body.kind)) throw serviceError('bad_request', `未知事项类型: ${body.kind}`);
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) throw serviceError('bad_request', '缺少内容');

  const validIds = new Set(listCurrentEntities(sessionId).map((e) => e.entity_id));
  const participantIds = Array.isArray(body.participants) ? body.participants.filter((id) => validIds.has(id)) : [];

  const round = resolveManualRound(sessionId);
  const threadId = crypto.randomUUID();
  const seq = nextThreadSeq(sessionId);
  upsertThread(sessionId, {
    threadId, seq, kind: body.kind, participantsJson: JSON.stringify(participantIds),
    content, status: 'active', openedRound: round,
  }, round);
  return { thread_id: threadId, seq, kind: body.kind, participants: participantIds, content, status: 'active', opened_round: round };
}

export function updateThread(sessionId, threadId, body = {}) {
  requireSession(sessionId);
  const thread = listThreads(sessionId).find((t) => t.thread_id === threadId);
  if (!thread) throw serviceError('not_found', '事项不存在');
  if (body.content === undefined && body.status === undefined) throw serviceError('bad_request', '缺少更新内容');

  let content = thread.content;
  if (body.content !== undefined) {
    content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) throw serviceError('bad_request', '缺少内容');
  }
  const status = body.status !== undefined ? body.status : thread.status;
  if (!THREAD_STATUSES.includes(status)) throw serviceError('bad_request', `未知状态: ${status}`);

  const round = resolveManualRound(sessionId);
  upsertThread(sessionId, {
    threadId: thread.thread_id, seq: thread.seq, kind: thread.kind, participantsJson: thread.participants_json,
    content, status, openedRound: thread.opened_round,
  }, round);
  return toThreadView({ ...thread, content, status });
}

// ============================
// 世界事实
// ============================

export function createFact(sessionId, body = {}) {
  requireSession(sessionId);
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) throw serviceError('bad_request', '缺少内容');
  if (listCurrentWorldFacts(sessionId).length >= STATE_WORLD_FACTS_MAX) throw serviceError('bad_request', '世界事实已满');

  const round = resolveManualRound(sessionId);
  const factId = crypto.randomUUID();
  const seq = nextFactSeq(sessionId);
  const truncated = truncateText(text);
  upsertWorldFact(sessionId, { factId, seq, text: truncated, evidence: '手动编辑' }, round);
  return { fact_id: factId, seq, text: truncated, evidence: '手动编辑', valid_from_round: round };
}

export function deleteFact(sessionId, factId) {
  requireSession(sessionId);
  const fact = listCurrentWorldFacts(sessionId).find((f) => f.fact_id === factId);
  if (!fact) throw serviceError('not_found', '世界事实不存在');
  closeWorldFact(sessionId, factId, resolveManualRound(sessionId));
  return { ok: true };
}
