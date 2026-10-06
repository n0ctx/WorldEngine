/**
 * state-memory-apply.js — 状态记忆操作写入器
 *
 * 把 all-state 调用输出的 `memory` 操作列表、`present` 在场名单、`entity_fields` 补丁应用到状态记忆多版本表。
 * 纯函数部分（引用解析、占位值/字段归属拦截、文本截断）单独导出便于测试；
 * `applyStateMemoryOps` 把一批操作的执行包在一个事务里，单条操作失败不影响其他操作。
 *
 * 对外接口：
 *   resolveEntityRef(ref, index) → entityId | null
 *   resolveSeqRef(ref, prefix, list, idField) → id | null
 *   buildEntityIndex(entities) → index
 *   isFieldOwnedByUserField(key, applicableUserFields) → boolean
 *   truncateText(text) / truncateListItems(items)
 *   applyStateMemoryOps({ sessionId, worldId, round, ops, turnText, realDate, mainCharacterEntityId })
 *     → { applied: number, rejected: {op, reason}[] }
 *   applyPresence({ sessionId, round, present })
 *     → { written: boolean, unresolved: string[] }
 *   applyEntityFields({ sessionId, worldId, entityFields, mainCharacterEntityId })
 *     → { applied: number, rejected: {ref, fieldKey?, reason}[] }
 *   ensureBaseEntities({ sessionId, worldId, round, persona, mainCharacter })
 *     → { playerEntityId, mainCharacterEntityId }
 */

import crypto from 'node:crypto';

import {
  upsertEntity, upsertProfileField, upsertDynamicState, closeDynamicState,
  upsertRelation, closeRelation, upsertThread, replaceThreadRows, upsertWorldProfile,
  upsertPresence,
  nextEntitySeq, nextThreadSeq, nextRelationSeq,
  listCurrentEntities, getEntityDetails, listCurrentRelations, listThreads,
  getCurrentWorldProfile,
} from '../db/queries/state-memory.js';
import { getWorldById } from '../db/queries/worlds.js';
import { withSessionStateTransaction } from '../db/queries/session-state-batch.js';
import { upsertEntityStateValues } from '../db/queries/session-entity-state-values.js';
import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import {
  ENTITY_TYPES, getProfileFieldDefinitions, resolveActiveProfileFields, getEditableProfileFields, parseProfileDefaults,
  isPlaceholderValue, THREAD_KINDS, EXCLUSIVE_PREDICATES, DYNAMIC_LOCATION_KEY,
} from './state-memory-schema.js';
import { parseWorldDate, compareWorldDate, isPastWorldDeadline } from '../utils/world-date.js';
import { validateValue } from '../utils/state-field-validate.js';
import {
  STATE_TEXT_FIELD_MAX, STATE_LIST_ITEM_MAX, STATE_LIST_MAX_ITEMS,
  THREAD_DORMANT_AFTER_ROUNDS,
} from '../utils/constants.js';
import { threadMatchesTurn } from './state-thread-relevance.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const log = createLogger('all-state');

const THREAD_OUTCOMES = ['resolved', 'failed'];
/** 模型没给依据的首次填写，证据列记这个标记 */
const PROFILE_FILL_EVIDENCE = 'AI 补全';
const PLACE_NAME_MAX_LENGTH = 20;
const SENTENCE_PUNCTUATION_RE = /[。！？.!?]/;

// ============================
// 纯函数：引用解析
// ============================

function parseAliases(aliasesJson) {
  try {
    const parsed = JSON.parse(aliasesJson || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function registerEntity(index, entity) {
  index.bySeq.set(entity.seq, entity);
  index.byId.set(entity.entity_id, entity);
  for (const name of [entity.name, ...parseAliases(entity.aliases_json)]) {
    if (name && !index.byNameOrAlias.has(name)) index.byNameOrAlias.set(name, entity);
  }
}

/** 由当前实体列表建立按 seq / 名字 / 别名索引的查找结构，供整批操作复用与增量更新。 */
export function buildEntityIndex(entities) {
  const index = { bySeq: new Map(), byId: new Map(), byNameOrAlias: new Map() };
  for (const entity of entities) registerEntity(index, entity);
  return index;
}

/** 解析 `entity` / `subject` / `object` 等引用：`e<seq>`，或完全匹配的名字 / 别名。解析不到返回 null。 */
export function resolveEntityRef(ref, index) {
  if (typeof ref !== 'string') return null;
  const trimmed = ref.trim();
  if (!trimmed) return null;
  const seqMatch = /^e(\d+)$/.exec(trimmed);
  if (seqMatch) {
    const entity = index.bySeq.get(Number(seqMatch[1]));
    return entity ? entity.entity_id : null;
  }
  const entity = index.byNameOrAlias.get(trimmed);
  return entity ? entity.entity_id : null;
}

/** 解析 `r<seq>` / `t<seq>` / `f<seq>` 这类带前缀的编号引用，从 list 中按 seq 找出对应行的 idField。 */
export function resolveSeqRef(ref, prefix, list, idField) {
  if (typeof ref !== 'string') return null;
  const match = new RegExp(`^${prefix}(\\d+)$`).exec(ref.trim());
  if (!match) return null;
  const row = list.find((item) => item.seq === Number(match[1]));
  return row ? row[idField] : null;
}

// ============================
// 纯函数：证据核验、占位值、字段归属、截断
// ============================

/** 模型附带的依据说明：非空字符串才记录，不核对原文，模型可按剧情合理推断或创作。 */
export function normalizeEvidence(evidence) {
  return typeof evidence === 'string' && evidence.trim() ? evidence.trim() : null;
}

/** 动态状态键是否与该实体适用的用户字段 field_key 或 label 相同（字段归属拦截）。 */
export function isFieldOwnedByUserField(key, applicableUserFields) {
  return applicableUserFields.some((field) => field.field_key === key || field.label === key);
}

export function truncateText(text) {
  return text.length > STATE_TEXT_FIELD_MAX ? text.slice(0, STATE_TEXT_FIELD_MAX) : text;
}

export function truncateListItems(items) {
  return items.slice(0, STATE_LIST_MAX_ITEMS).map((item) => (
    typeof item === 'string' && item.length > STATE_LIST_ITEM_MAX ? item.slice(0, STATE_LIST_ITEM_MAX) : item
  ));
}

function normalizeListItems(payload) {
  if (Array.isArray(payload)) {
    return payload.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  }
  if (typeof payload === 'string' && payload.trim()) return [payload.trim()];
  return [];
}

/** 规范化后丢弃占位值，供新增列表项（list_add）与整体替换（写入非空列表）共用。 */
function filterCleanListItems(payload) {
  return normalizeListItems(payload).filter((item) => !isPlaceholderValue(item));
}

// ============================
// 执行上下文
// ============================

function buildApplyContext({ sessionId, worldId, round, turnText, realDate, mainCharacterEntityId }) {
  const entities = listCurrentEntities(sessionId);
  const index = buildEntityIndex(entities);
  const details = getEntityDetails(sessionId, entities.map((entity) => entity.entity_id));
  const profileValues = new Map();
  for (const [entityId, detail] of Object.entries(details)) {
    const fieldMap = new Map();
    for (const [fieldKey, { value_json: valueJson }] of Object.entries(detail.profile)) {
      let parsed = null;
      try { parsed = JSON.parse(valueJson); } catch { /* 解析失败视为无值 */ }
      fieldMap.set(fieldKey, parsed);
    }
    profileValues.set(entityId, fieldMap);
  }

  const allCharacterFields = getCharacterStateFieldsByWorldId(worldId);
  const nearbyCharacterFields = allCharacterFields.filter((field) => field.nearby_enabled);
  const profileFieldCache = new Map();

  return {
    sessionId, worldId, round, realDate, mainCharacterEntityId, index,
    relations: listCurrentRelations(sessionId),
    threads: listThreads(sessionId),
    turnText: turnText ?? '',
    worldProfile: getCurrentWorldProfile(sessionId),
    highBarUsed: new Set(),
    profileValues, profileFieldCache, allCharacterFields, nearbyCharacterFields,
  };
}

function createNewEntity(ctx, { name, type, aliases, cardId = null }) {
  const seq = nextEntitySeq(ctx.sessionId);
  const entityId = crypto.randomUUID();
  const cleanAliases = Array.isArray(aliases) ? aliases.filter((alias) => typeof alias === 'string' && alias.trim()) : [];
  const aliasesJson = JSON.stringify(cleanAliases);
  upsertEntity(ctx.sessionId, { entityId, seq, type, name, aliasesJson, cardId }, ctx.round);
  const entity = {
    entity_id: entityId, seq, type, name, aliases_json: aliasesJson,
    card_id: cardId, pinned: 0, status: 'active',
  };
  registerEntity(ctx.index, entity);
  return entity;
}

/**
 * 地点解析：能对应到 location 实体时存其 ID 和名字；否则只存文字。
 * createIfMissing 时（世界当前地点），明确地名还会自动建 location 实体；角色「位置」常是走廊、床边这类
 * 不值得建档的小地点，只关联已有实体。
 */
function resolveLocationValue(rawValue, ctx, { createIfMissing }) {
  if (isPlaceholderValue(rawValue)) return null;
  const refId = resolveEntityRef(rawValue, ctx.index);
  if (refId) {
    const entity = ctx.index.byId.get(refId);
    if (entity.type === 'location') return { text: entity.name, locationEntityId: entity.entity_id };
  }
  const text = truncateText(String(rawValue).trim());
  if (!text) return null;
  const existing = ctx.index.byNameOrAlias.get(text);
  if (existing?.type === 'location') return { text: existing.name, locationEntityId: existing.entity_id };
  const looksLikePlaceName = text.length <= PLACE_NAME_MAX_LENGTH && !SENTENCE_PUNCTUATION_RE.test(text);
  if (!createIfMissing || !looksLikePlaceName) return { text, locationEntityId: null };
  const entity = createNewEntity(ctx, { name: text, type: 'location', aliases: [] });
  return { text: entity.name, locationEntityId: entity.entity_id };
}

/** 更新实体行前先套用改动（重命名 / 加别名 / 退场），供 handleRename / handleAddAlias / handleRetireEntity 共用。 */
function buildEntityRowPatch(entity, overrides) {
  return {
    entityId: entity.entity_id, seq: entity.seq, type: entity.type, name: entity.name,
    aliasesJson: entity.aliases_json, cardId: entity.card_id, pinned: entity.pinned, status: entity.status,
    ...overrides,
  };
}

/** 事项行的当前字段，供 handleUpdateThread / handleResolveThread 共用。 */
function buildThreadRow(thread, overrides) {
  return {
    threadId: thread.thread_id, seq: thread.seq, kind: thread.kind,
    participantsJson: thread.participants_json, content: thread.content,
    status: thread.status, openedRound: thread.opened_round,
    lastTouchedRound: thread.last_touched_round ?? thread.opened_round,
    deadline: thread.deadline ?? null,
    ...overrides,
  };
}

// ============================
// 档案字段写入（可变性与证据规则）
// ============================

/** 档案字段当前值（数组，取不到时为空数组），供 list_add / list_remove 共用。 */
function getProfileListValue(ctx, entityId, fieldKey) {
  const value = ctx.profileValues.get(entityId)?.get(fieldKey);
  return Array.isArray(value) ? value : [];
}

function commitProfileWrite(entity, fieldDef, value, evidence, ctx) {
  upsertProfileField(ctx.sessionId, entity.entity_id, fieldDef.key, JSON.stringify(value), evidence ?? null, ctx.round);
  if (!ctx.profileValues.has(entity.entity_id)) ctx.profileValues.set(entity.entity_id, new Map());
  ctx.profileValues.get(entity.entity_id).set(fieldDef.key, value);
  return { ok: true };
}

function applyListAdd(entity, fieldDef, items, evidence, ctx) {
  const cleanItems = filterCleanListItems(items);
  if (cleanItems.length === 0) return { ok: false, reason: '占位值或空列表' };
  const merged = truncateListItems([...getProfileListValue(ctx, entity.entity_id, fieldDef.key), ...cleanItems]);
  return commitProfileWrite(entity, fieldDef, merged, evidence, ctx);
}

function applyListRemove(entity, fieldDef, items, evidence, ctx) {
  const removeSet = new Set(normalizeListItems(items));
  if (removeSet.size === 0) return { ok: false, reason: '缺少要移除的项' };
  const remaining = getProfileListValue(ctx, entity.entity_id, fieldDef.key).filter((item) => !removeSet.has(item));
  return commitProfileWrite(entity, fieldDef, remaining, evidence, ctx);
}

/** list 型字段的通用写入路径：list_add / list_remove 增量改动，其余（create/update/correct）整体替换。 */
function writeListLikeField(entity, fieldDef, opType, payload, evidence, ctx) {
  if (opType === 'list_add') return applyListAdd(entity, fieldDef, payload, evidence, ctx);
  if (opType === 'list_remove') return applyListRemove(entity, fieldDef, payload, evidence, ctx);
  const items = filterCleanListItems(payload);
  if (items.length === 0) return { ok: false, reason: '占位值或空列表' };
  return commitProfileWrite(entity, fieldDef, truncateListItems(items), evidence, ctx);
}

function writeTextField(entity, fieldDef, opType, value, evidence, ctx) {
  if (typeof value !== 'string' || isPlaceholderValue(value)) return { ok: false, reason: '占位值或空文本' };
  const trimmed = value.trim();
  if (fieldDef.key === 'birth_date' && !parseWorldDate(trimmed)) return { ok: false, reason: '出生日期格式无效' };
  if (fieldDef.mutability === 'immutable' && opType === 'correct') {
    log.warn(`STATE MEMORY IMMUTABLE CORRECTED  ${formatMeta({ entity: entity.entity_id, field: fieldDef.key })}`);
  }
  return commitProfileWrite(entity, fieldDef, truncateText(trimmed), evidence, ctx);
}

function writeStandardField(entity, fieldDef, opType, payload, evidence, ctx) {
  if (fieldDef.mutability === 'immutable' && hasProfileValue(ctx, entity.entity_id, fieldDef.key) && opType !== 'correct') {
    return { ok: false, reason: 'immutable 已有值时须用 correct_profile' };
  }
  if (fieldDef.kind === 'list') return writeListLikeField(entity, fieldDef, opType, payload, evidence, ctx);
  return writeTextField(entity, fieldDef, opType, payload, evidence, ctx);
}

function writeAppendOnlyField(entity, fieldDef, opType, payload, evidence, ctx) {
  if (!['list_add', 'create'].includes(opType)) return { ok: false, reason: 'background 只能 list_add' };
  return applyListAdd(entity, fieldDef, payload, evidence, ctx);
}

function writeHighBarField(entity, fieldDef, opType, payload, evidence, ctx) {
  if (['update', 'correct'].includes(opType)) return { ok: false, reason: '高门槛字段禁止整体替换' };
  const roundKey = `${entity.entity_id}:${fieldDef.key}`;
  if (ctx.highBarUsed.has(roundKey)) return { ok: false, reason: '高门槛字段本轮已用满一次' };
  const result = opType === 'list_remove'
    ? applyListRemove(entity, fieldDef, payload, evidence, ctx)
    : applyListAdd(entity, fieldDef, payload, evidence, ctx);
  if (result.ok) ctx.highBarUsed.add(roundKey);
  return result;
}

/** 某实体类型的档案字段定义 + 当前世界启用集合，按类型缓存一次，避免每条操作都重新计算同义字段停用。 */
function getProfileFieldCache(ctx, type) {
  if (!ctx.profileFieldCache.has(type)) {
    ctx.profileFieldCache.set(type, {
      byKey: new Map(getProfileFieldDefinitions(type).map((field) => [field.key, field])),
      active: new Set(resolveActiveProfileFields(ctx.worldId, type)),
    });
  }
  return ctx.profileFieldCache.get(type);
}

function gateProfileWrite(entity, fieldKey, ctx) {
  const { byKey, active } = getProfileFieldCache(ctx, entity.type);
  const fieldDef = byKey.get(fieldKey);
  if (!fieldDef) return { ok: false, reason: `未知档案字段: ${fieldKey}` };
  if (fieldDef.kind === 'age') return { ok: false, reason: '年龄按出生日期自动计算，不接受 AI 写入' };
  if (!active.has(fieldKey)) return { ok: false, reason: `档案字段已停用: ${fieldKey}` };
  return { ok: true, fieldDef };
}

/** 按 §3.4 可变性表写入档案字段，供 create_entity / update_profile / correct_profile / list_add / list_remove 共用。 */
/** 已有真实取值：空列表、「未知」「无」这类占位值都算空，首次填写可以直接补上。 */
function hasProfileValue(ctx, entityId, fieldKey) {
  const value = ctx.profileValues.get(entityId)?.get(fieldKey);
  return Array.isArray(value) ? value.length > 0 : !isPlaceholderValue(value);
}

function writeProfileFieldGeneric(entity, fieldKey, opType, payload, evidence, ctx) {
  const gate = gateProfileWrite(entity, fieldKey, ctx);
  if (!gate.ok) return gate;
  const { fieldDef } = gate;

  if (fieldDef.mutability === 'dynamic') return writeListLikeField(entity, fieldDef, opType, payload, null, ctx);
  if (fieldDef.appendOnly) return writeAppendOnlyField(entity, fieldDef, opType, payload, evidence, ctx);
  if (fieldDef.highBar) return writeHighBarField(entity, fieldDef, opType, payload, evidence, ctx);
  return writeStandardField(entity, fieldDef, opType, payload, evidence, ctx);
}

/**
 * 首次填写（create_entity 初始档案、fill_profile）：只能写空字段，改动已有值走 update_profile；
 * 模型没给依据时证据记为 PROFILE_FILL_EVIDENCE。
 */
function writeInitialProfileField(entity, fieldKey, value, evidence, ctx) {
  if (hasProfileValue(ctx, entity.entity_id, fieldKey)) return { ok: false, reason: '已有值的档案字段须用 update_profile 改动' };
  return writeProfileFieldGeneric(entity, fieldKey, 'create', value, normalizeEvidence(evidence) ?? PROFILE_FILL_EVIDENCE, ctx);
}

/** 按 { 字段key: 值 或 { value, evidence } } 逐项首次填写档案，单项失败只记日志；返回写入成功的项数。 */
function fillProfileEntries(entity, profile, ctx) {
  let written = 0;
  for (const [fieldKey, entry] of Object.entries(profile)) {
    const isWrapped = entry && typeof entry === 'object' && !Array.isArray(entry) && 'value' in entry;
    const value = isWrapped ? entry.value : entry;
    const result = writeInitialProfileField(entity, fieldKey, value, isWrapped ? entry.evidence : null, ctx);
    if (result.ok) {
      written += 1;
    } else {
      log.warn(`STATE MEMORY PROFILE FILL SKIP  ${formatMeta({ entity: entity.entity_id, field: fieldKey, reason: result.reason })}`);
    }
  }
  return written;
}

// ============================
// 操作处理函数
// ============================

/** 解析 op.entity 引用为实体对象，找不到返回 null；带这个字段的处理函数共用这个模式。 */
function resolveOpEntity(op, ctx) {
  const entityId = resolveEntityRef(op.entity, ctx.index);
  return entityId ? ctx.index.byId.get(entityId) : null;
}

/** 解析一组实体引用（数组以外一律视为空），供 open_thread 的 participants 使用。 */
function resolveEntityRefList(refs, ctx) {
  return Array.isArray(refs) ? refs.map((ref) => resolveEntityRef(ref, ctx.index)).filter(Boolean) : [];
}

/** 包一层「先解析 op.entity，找不到统一拒绝」，减少每个按实体操作的处理函数里重复这两行。 */
function withResolvedEntity(handler) {
  return (op, ctx) => {
    const entity = resolveOpEntity(op, ctx);
    if (!entity) return { ok: false, reason: '实体引用解析失败' };
    return handler(op, ctx, entity);
  };
}

function handleCreateEntity(op, ctx) {
  const name = typeof op.name === 'string' ? op.name.trim() : '';
  if (!name) return { ok: false, reason: '缺少名字' };
  if (!ENTITY_TYPES.includes(op.type)) return { ok: false, reason: `未知实体类型: ${op.type}` };
  const existing = ctx.index.byNameOrAlias.get(name);
  const entity = existing ?? createNewEntity(ctx, { name, type: op.type, aliases: op.aliases });
  if (op.profile && typeof op.profile === 'object') fillProfileEntries(entity, op.profile, ctx);
  return { ok: true };
}

const handleFillProfile = withResolvedEntity((op, ctx, entity) => {
  if (!op.profile || typeof op.profile !== 'object') return { ok: false, reason: '缺少 profile' };
  return fillProfileEntries(entity, op.profile, ctx) > 0 ? { ok: true } : { ok: false, reason: '没有可补全的空字段' };
});

/** update_profile / correct_profile / list_add / list_remove 都只是「解析实体 + 校验 field + 走 writeProfileFieldGeneric」换个 opType。 */
function makeProfileFieldHandler(opType, payloadKey) {
  return withResolvedEntity((op, ctx, entity) => {
    const fieldKey = typeof op.field === 'string' ? op.field.trim() : '';
    if (!fieldKey) return { ok: false, reason: '缺少 field' };
    return writeProfileFieldGeneric(entity, fieldKey, opType, op[payloadKey], normalizeEvidence(op.evidence), ctx);
  });
}

const handleRename = withResolvedEntity((op, ctx, entity) => {
  const newName = typeof op.name === 'string' ? op.name.trim() : '';
  if (!newName) return { ok: false, reason: '缺少新名字' };
  const conflict = ctx.index.byNameOrAlias.get(newName);
  if (conflict && conflict.entity_id !== entity.entity_id) return { ok: false, reason: '名字与其他实体重名' };
  ctx.index.byNameOrAlias.delete(entity.name);
  entity.name = newName;
  // guard-allow(duplication): 改名和加别名都要「登记新索引项 + 落库」，两者索引项含义不同（改名替换、别名新增），强行合并会让改名逻辑失去删旧索引这一步的位置
  if (!ctx.index.byNameOrAlias.has(newName)) ctx.index.byNameOrAlias.set(newName, entity);
  upsertEntity(ctx.sessionId, buildEntityRowPatch(entity), ctx.round);
  return { ok: true };
});

const handleAddAlias = withResolvedEntity((op, ctx, entity) => {
  const alias = typeof op.alias === 'string' ? op.alias.trim() : '';
  if (!alias) return { ok: false, reason: '缺少别名' };
  entity.aliases_json = JSON.stringify([...parseAliases(entity.aliases_json), alias]);
  if (!ctx.index.byNameOrAlias.has(alias)) ctx.index.byNameOrAlias.set(alias, entity);
  upsertEntity(ctx.sessionId, buildEntityRowPatch(entity), ctx.round);
  return { ok: true };
});

const handleSetState = withResolvedEntity((op, ctx, entity) => {
  const key = typeof op.key === 'string' ? op.key.trim() : '';
  if (!key) return { ok: false, reason: '缺少 key' };
  const applicableUserFields = entity.type !== 'character' ? []
    : entity.entity_id === ctx.mainCharacterEntityId ? ctx.allCharacterFields
      : ctx.nearbyCharacterFields;
  if (isFieldOwnedByUserField(key, applicableUserFields)) {
    return { ok: false, reason: `字段已由用户状态字段负责: ${key}` };
  }
  if (key === DYNAMIC_LOCATION_KEY) {
    const resolved = resolveLocationValue(op.value, ctx, { createIfMissing: false });
    if (!resolved) return { ok: false, reason: '占位值或地点解析失败' };
    upsertDynamicState(ctx.sessionId, entity.entity_id, DYNAMIC_LOCATION_KEY, resolved.text, ctx.round);
    return { ok: true };
  }
  if (isPlaceholderValue(op.value)) return { ok: false, reason: '占位值' };
  upsertDynamicState(ctx.sessionId, entity.entity_id, key, truncateText(String(op.value).trim()), ctx.round);
  return { ok: true };
});

const handleClearState = withResolvedEntity((op, ctx, entity) => {
  const key = typeof op.key === 'string' ? op.key.trim() : '';
  if (!key) return { ok: false, reason: '缺少 key' };
  closeDynamicState(ctx.sessionId, entity.entity_id, key, ctx.round);
  return { ok: true };
});

function handleUpsertRelation(op, ctx) {
  const subjectId = resolveEntityRef(op.subject, ctx.index);
  if (!subjectId) return { ok: false, reason: '主体引用解析失败' };
  const predicate = typeof op.predicate === 'string' ? op.predicate.trim() : '';
  if (!predicate) return { ok: false, reason: '缺少谓词' };
  const objectId = op.object ? resolveEntityRef(op.object, ctx.index) : null;
  const objectText = typeof op.object === 'string' ? op.object : op.objectValue;
  const objectValue = objectId ? null : (typeof objectText === 'string' && objectText.trim() ? truncateText(objectText.trim()) : null);

  if (EXCLUSIVE_PREDICATES.includes(predicate)) {
    const previous = ctx.relations.find((r) => r.subject_id === subjectId && r.predicate === predicate);
    if (previous) {
      closeRelation(ctx.sessionId, previous.relation_id, ctx.round);
      ctx.relations = ctx.relations.filter((r) => r.relation_id !== previous.relation_id);
    }
  } else {
    const duplicate = ctx.relations.some((r) => r.subject_id === subjectId && r.predicate === predicate
      && (objectId ? r.object_id === objectId : r.object_value === objectValue));
    if (duplicate) return { ok: false, reason: '关系已存在' };
  }
  // 同一主体到同一客体实体只保留一条关系：关系演变（如「意向」→「确立」）时新谓词替换旧的
  if (objectId) {
    const superseded = ctx.relations.filter((r) => r.subject_id === subjectId && r.object_id === objectId);
    // guard-allow(perf-shape): 规则保证同一主客体对至多一条现存关系，只有规则生效前的旧数据才会多于一条
    for (const previous of superseded) closeRelation(ctx.sessionId, previous.relation_id, ctx.round);
    ctx.relations = ctx.relations.filter((r) => !superseded.includes(r));
  }

  const relationId = crypto.randomUUID();
  const seq = nextRelationSeq(ctx.sessionId);
  upsertRelation(ctx.sessionId, { relationId, seq, subjectId, predicate, objectId, objectValue, note: op.note ?? '' }, ctx.round);
  ctx.relations.push({
    relation_id: relationId, seq, subject_id: subjectId, predicate,
    object_id: objectId, object_value: objectValue, note: op.note ?? '',
  });
  return { ok: true };
}

function handleRetireRelation(op, ctx) {
  const relationId = resolveSeqRef(op.relation, 'r', ctx.relations, 'relation_id');
  if (!relationId) return { ok: false, reason: '关系引用解析失败' };
  closeRelation(ctx.sessionId, relationId, ctx.round);
  ctx.relations = ctx.relations.filter((r) => r.relation_id !== relationId);
  return { ok: true };
}

function normalizedThreadContent(content) {
  return content.replace(/\s+/g, '');
}

/**
 * 读取操作里的期限：没给返回 undefined（不改动）；null 或空串表示取消期限；
 * 格式无效时当作没给，事项本身照常写入。
 */
function readThreadDeadline(op, ctx) {
  if (op.deadline === undefined) return undefined;
  const trimmed = typeof op.deadline === 'string' ? op.deadline.trim() : '';
  if (op.deadline === null || !trimmed) return null;
  if (parseWorldDate(trimmed)) return trimmed;
  log.warn(`STATE MEMORY THREAD DEADLINE IGNORED  ${formatMeta({ session: ctx.sessionId.slice(0, 8), op: op.op, deadline: op.deadline })}`);
  return undefined;
}

function handleOpenThread(op, ctx) {
  if (!THREAD_KINDS.includes(op.kind)) return { ok: false, reason: `未知事项类型: ${op.kind}` };
  const content = typeof op.content === 'string' ? op.content.trim() : '';
  if (!content) return { ok: false, reason: '缺少内容' };
  const duplicate = ctx.threads.some((thread) => (
    (thread.status === 'active' || thread.status === 'dormant')
    && thread.kind === op.kind
    && normalizedThreadContent(thread.content) === normalizedThreadContent(content)
  ));
  if (duplicate) return { ok: false, reason: '已有相同的未了事项' };
  const participantIds = resolveEntityRefList(op.participants, ctx);
  const threadId = crypto.randomUUID();
  const seq = nextThreadSeq(ctx.sessionId);
  const participantsJson = JSON.stringify(participantIds);
  const deadline = readThreadDeadline(op, ctx) ?? null;
  upsertThread(ctx.sessionId, {
    threadId, seq, kind: op.kind, participantsJson, content, status: 'active',
    openedRound: ctx.round, lastTouchedRound: ctx.round, deadline,
  }, ctx.round);
  ctx.threads.push({
    thread_id: threadId, seq, kind: op.kind, participants_json: participantsJson,
    content, status: 'active', opened_round: ctx.round, last_touched_round: ctx.round, deadline,
  });
  return { ok: true };
}

function handleUpdateThread(op, ctx) {
  const threadId = resolveSeqRef(op.thread, 't', ctx.threads, 'thread_id');
  if (!threadId) return { ok: false, reason: '事项引用解析失败' };
  const content = typeof op.content === 'string' ? op.content.trim() : '';
  if (!content) return { ok: false, reason: '缺少内容' };
  const thread = ctx.threads.find((t) => t.thread_id === threadId);
  const status = thread.status === 'dormant' ? 'active' : thread.status;
  const requested = readThreadDeadline(op, ctx);
  const deadline = requested === undefined ? thread.deadline ?? null : requested;
  upsertThread(ctx.sessionId, buildThreadRow(thread, { content, status, lastTouchedRound: ctx.round, deadline }), ctx.round);
  thread.content = content;
  thread.status = status;
  thread.last_touched_round = ctx.round;
  thread.deadline = deadline;
  return { ok: true };
}

function handleResolveThread(op, ctx) {
  const threadId = resolveSeqRef(op.thread, 't', ctx.threads, 'thread_id');
  if (!threadId) return { ok: false, reason: '事项引用解析失败' };
  if (!THREAD_OUTCOMES.includes(op.outcome)) return { ok: false, reason: `未知结果: ${op.outcome}` };
  const thread = ctx.threads.find((t) => t.thread_id === threadId);
  upsertThread(ctx.sessionId, buildThreadRow(thread, { status: op.outcome, lastTouchedRound: ctx.round }), ctx.round);
  thread.status = op.outcome;
  thread.last_touched_round = ctx.round;
  return { ok: true };
}

const handleRetireEntity = withResolvedEntity((op, ctx, entity) => {
  const entityId = entity.entity_id;
  upsertEntity(ctx.sessionId, buildEntityRowPatch(entity, { status: 'retired' }), ctx.round);
  entity.status = 'retired';
  // guard-allow(perf-shape): 单个实体退场时要关闭的关系数随单轮剧情而定，数量很小，不做批量查询
  for (const relation of ctx.relations.filter((r) => r.subject_id === entityId || r.object_id === entityId)) {
    closeRelation(ctx.sessionId, relation.relation_id, ctx.round);
  }
  ctx.relations = ctx.relations.filter((r) => r.subject_id !== entityId && r.object_id !== entityId);
  return { ok: true };
});

function handleSetWorld(op, ctx) {
  if (op.key === 'time') {
    if (ctx.realDate) return { ok: false, reason: '真实日期模式下丢弃 AI 时间写入' };
    const trimmed = typeof op.value === 'string' ? op.value.trim() : '';
    const parsed = parseWorldDate(trimmed);
    if (!parsed) return { ok: false, reason: '时间格式无效' };
    const current = ctx.worldProfile.time ? parseWorldDate(ctx.worldProfile.time) : null;
    if (current && compareWorldDate(parsed, current) < 0) return { ok: false, reason: '时间不得回退' };
    upsertWorldProfile(ctx.sessionId, 'time', trimmed, null, ctx.round);
    ctx.worldProfile.time = trimmed;
    return { ok: true };
  }
  if (op.key === 'location') {
    const resolved = resolveLocationValue(op.value, ctx, { createIfMissing: true });
    if (!resolved) return { ok: false, reason: '占位值或地点解析失败' };
    upsertWorldProfile(ctx.sessionId, 'location', resolved.text, resolved.locationEntityId, ctx.round);
    ctx.worldProfile.location = resolved.text;
    ctx.worldProfile.location_entity_id = resolved.locationEntityId;
    return { ok: true };
  }
  return { ok: false, reason: `未知世界档案键: ${op.key}` };
}

const OP_HANDLERS = {
  create_entity: handleCreateEntity,
  fill_profile: handleFillProfile,
  update_profile: makeProfileFieldHandler('update', 'value'),
  list_add: makeProfileFieldHandler('list_add', 'items'),
  list_remove: makeProfileFieldHandler('list_remove', 'items'),
  correct_profile: makeProfileFieldHandler('correct', 'value'),
  rename: handleRename,
  add_alias: handleAddAlias,
  set_state: handleSetState,
  clear_state: handleClearState,
  upsert_relation: handleUpsertRelation,
  retire_relation: handleRetireRelation,
  open_thread: handleOpenThread,
  update_thread: handleUpdateThread,
  resolve_thread: handleResolveThread,
  retire_entity: handleRetireEntity,
  set_world: handleSetWorld,
};

/** 进行中事项连续多轮没被对话碰到时搁置。一次查出再写入，不刷新上次触碰轮次。 */
function dormantUntouchedThreads(ctx) {
  const names = new Map([...ctx.index.byId.values()].map((entity) => [entity.entity_id, entity.name]));
  const stale = ctx.threads.filter((thread) => {
    if (thread.status !== 'active') return false;
    const lastTouched = thread.last_touched_round ?? thread.opened_round ?? 0;
    return ctx.round - lastTouched >= THREAD_DORMANT_AFTER_ROUNDS && !threadMatchesTurn(thread, ctx.turnText, names);
  });
  replaceThreadRows(ctx.sessionId, stale.map((thread) => ({ ...thread, status: 'dormant' })), ctx.round);
  for (const thread of stale) thread.status = 'dormant';
}

/** 故事时间已过期限、仍未了结（进行中或搁置）的事项标为已过期。在本轮操作之后执行，按本轮推进后的时间判断。 */
function expireOverdueThreads(ctx) {
  const now = ctx.worldProfile.time ? parseWorldDate(ctx.worldProfile.time) : null;
  if (!now) return;
  const overdue = ctx.threads.filter((thread) => (
    (thread.status === 'active' || thread.status === 'dormant') && isPastWorldDeadline(thread.deadline, now)
  ));
  replaceThreadRows(ctx.sessionId, overdue.map((thread) => ({ ...thread, status: 'expired' })), ctx.round);
  for (const thread of overdue) thread.status = 'expired';
}

// ============================
// 对外接口
// ============================

/**
 * 把一批状态记忆操作应用到当前会话，整批包在一个事务里；单条操作失败不影响其他操作。
 * @returns {{ applied: number, rejected: {op: object, reason: string}[] }}
 */
export function applyStateMemoryOps({ sessionId, worldId, round, ops, turnText, realDate, mainCharacterEntityId }) {
  if (!Array.isArray(ops)) return { applied: 0, rejected: [] };

  return withSessionStateTransaction(() => {
    const ctx = buildApplyContext({ sessionId, worldId, round, turnText, realDate, mainCharacterEntityId });
    dormantUntouchedThreads(ctx);
    let applied = 0;
    const rejected = [];
    const reject = (op, reason) => {
      rejected.push({ op, reason });
      log.warn(`STATE MEMORY OP REJECTED  ${formatMeta({ session: sessionId.slice(0, 8), op: op?.op, reason })}`);
    };
    for (const op of ops) {
      if (!op || typeof op !== 'object' || typeof op.op !== 'string') {
        reject(op, '操作格式无效');
        continue;
      }
      const handler = OP_HANDLERS[op.op];
      if (!handler) {
        reject(op, `未知操作: ${op.op}`);
        continue;
      }
      try {
        const result = handler(op, ctx);
        if (result?.ok) {
          applied += 1;
        } else {
          reject(op, result?.reason ?? '未知原因');
        }
      } catch (err) {
        rejected.push({ op, reason: err.message });
        log.warn(`STATE MEMORY OP ERROR  ${formatMeta({ session: sessionId.slice(0, 8), op: op.op, error: err.message })}`);
      }
    }
    expireOverdueThreads(ctx);
    return { applied, rejected };
  });
}

/**
 * 写入本轮在场名单（all-state 输出的顶层 `present`）。在 memory 操作之后调用，
 * 才能按名字引用同一批新建的实体；模型没给数组时不写，沿用上一轮名单。
 * @returns {{ written: boolean, unresolved: string[] }}
 */
export function applyPresence({ sessionId, round, present }) {
  const session = sessionId.slice(0, 8);
  if (!Array.isArray(present)) {
    log.warn(`STATE MEMORY PRESENT MISSING  ${formatMeta({ session })}`);
    return { written: false, unresolved: [] };
  }
  const index = buildEntityIndex(listCurrentEntities(sessionId));
  const entityIds = present.map((ref) => resolveEntityRef(ref, index));
  const unresolved = present.filter((_, i) => !entityIds[i]);
  if (unresolved.length > 0) log.warn(`STATE MEMORY PRESENT SKIP  ${formatMeta({ session, refs: unresolved })}`);
  upsertPresence(sessionId, round, entityIds.filter(Boolean));
  return { written: true, unresolved };
}

/**
 * 把 `entity_fields` 补丁写入角色实体的用户字段值：只接受目标为角色实体、非 player、非主角色，
 * 且字段 `update_mode='llm_auto'` 且 `nearby_enabled=1`，经 validateValue 校验后写入。
 * @returns {{ applied: number, rejected: {ref: string, fieldKey?: string, reason: string}[] }}
 */
export function applyEntityFields({ sessionId, worldId, entityFields, mainCharacterEntityId }) {
  if (!entityFields || typeof entityFields !== 'object') return { applied: 0, rejected: [] };

  const index = buildEntityIndex(listCurrentEntities(sessionId));
  const fieldByKey = new Map(getCharacterStateFieldsByWorldId(worldId).map((field) => [field.field_key, field]));
  const rows = [];
  const rejected = [];

  for (const [ref, patch] of Object.entries(entityFields)) {
    const entityId = resolveEntityRef(ref, index);
    if (!entityId) { rejected.push({ ref, reason: '实体引用解析失败' }); continue; }
    const entity = index.byId.get(entityId);
    if (entity.type !== 'character' || entity.entity_id === mainCharacterEntityId) {
      rejected.push({ ref, reason: '目标不是可写的 NPC 实体' });
      continue;
    }
    if (!patch || typeof patch !== 'object') { rejected.push({ ref, reason: '字段值格式无效' }); continue; }
    for (const [fieldKey, rawValue] of Object.entries(patch)) {
      const field = fieldByKey.get(fieldKey);
      if (!field || field.update_mode !== 'llm_auto' || !field.nearby_enabled) {
        rejected.push({ ref, fieldKey, reason: '字段不适用或非自动更新' });
        continue;
      }
      const validated = validateValue(rawValue, field);
      if (validated === undefined) { rejected.push({ ref, fieldKey, reason: '校验失败' }); continue; }
      rows.push({ entityId, fieldKey, runtimeValueJson: validated === null ? null : JSON.stringify(validated) });
    }
  }

  if (rows.length > 0) upsertEntityStateValues(sessionId, rows);
  for (const item of rejected) {
    log.warn(`STATE MEMORY ENTITY FIELD REJECTED  ${formatMeta({ session: sessionId.slice(0, 8), ref: item.ref, field: item.fieldKey, reason: item.reason })}`);
  }
  return { applied: rows.length, rejected };
}

const PROFILE_DEFAULT_EVIDENCE = '初始值';

/** 世界卡上的开场时间、开场地点。只保留合法日期和地点文本。 */
function parseWorldProfileDefaults(profileDefaultsJson) {
  const parsed = parseProfileDefaults(profileDefaultsJson);
  const defaults = {};
  if (!isPlaceholderValue(parsed.time) && parseWorldDate(parsed.time)) defaults.time = parsed.time;
  if (!isPlaceholderValue(parsed.location)) defaults.location = parsed.location;
  return defaults;
}

/** 新会话还没有世界档案时，把世界卡的开场时间、开场地点带入。已有值不覆盖。 */
function seedWorldProfileDefaults(sessionId, worldId, round) {
  const defaults = parseWorldProfileDefaults(getWorldById(worldId)?.profile_defaults_json);
  const current = getCurrentWorldProfile(sessionId);
  if (defaults.time && !current.time) upsertWorldProfile(sessionId, 'time', defaults.time, null, round);
  if (defaults.location && !current.location) upsertWorldProfile(sessionId, 'location', defaults.location, null, round);
}

/**
 * 把角色卡 / 人设的档案初始值带入会话实体：只写本世界启用、会话里还没有记录的字段，已有值不覆盖。
 */
export function seedProfileDefaults(sessionId, { entityId, entityType, worldId, profileDefaultsJson, round }) {
  const defaults = parseProfileDefaults(profileDefaultsJson);
  // 初始值只有文本和文本列表；空列表和占位文本都不带入
  const fields = getEditableProfileFields(worldId, entityType).filter((field) => {
    const value = defaults[field.key];
    return Array.isArray(value) ? value.length > 0 : !isPlaceholderValue(value);
  });
  if (fields.length === 0) return;
  const current = getEntityDetails(sessionId, [entityId])[entityId]?.profile ?? {};
  // guard-allow(perf-shape): 档案字段是固定的十几个，逐个写入
  for (const field of fields.filter((f) => !current[f.key])) {
    upsertProfileField(sessionId, entityId, field.key, JSON.stringify(defaults[field.key]), PROFILE_DEFAULT_EVIDENCE, round);
  }
}

/**
 * 幂等地建好玩家实体和对话模式的主角色实体，并把人设 / 主角色卡的档案初始值补进还空着的档案字段。
 * @returns {{ playerEntityId: string, mainCharacterEntityId: string | null }}
 */
export function ensureBaseEntities({ sessionId, worldId, round, persona, mainCharacter }) {
  return withSessionStateTransaction(() => {
    const entities = listCurrentEntities(sessionId);
    const index = buildEntityIndex(entities);
    const ctx = { sessionId, round, index };

    let playerEntityId = entities.find((entity) => entity.type === 'player')?.entity_id ?? null;
    if (!playerEntityId) {
      const name = (typeof persona?.name === 'string' && persona.name.trim()) || '玩家';
      playerEntityId = createNewEntity(ctx, { name, type: 'player', aliases: [] }).entity_id;
    }
    seedProfileDefaults(sessionId, {
      entityId: playerEntityId, entityType: 'player', worldId, profileDefaultsJson: persona?.profile_defaults_json, round,
    });

    let mainCharacterEntityId = null;
    if (mainCharacter?.id) {
      mainCharacterEntityId = entities.find((entity) => entity.card_id === mainCharacter.id)?.entity_id ?? null;
      if (!mainCharacterEntityId) {
        const name = (typeof mainCharacter.name === 'string' && mainCharacter.name.trim()) || '角色';
        mainCharacterEntityId = createNewEntity(ctx, { name, type: 'character', aliases: [], cardId: mainCharacter.id }).entity_id;
      }
      seedProfileDefaults(sessionId, {
        entityId: mainCharacterEntityId, entityType: 'character', worldId, profileDefaultsJson: mainCharacter.profile_defaults_json, round,
      });
    }

    seedWorldProfileDefaults(sessionId, worldId, round);

    return { playerEntityId, mainCharacterEntityId };
  });
}
