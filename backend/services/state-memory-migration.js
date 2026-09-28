/**
 * state-memory-migration.js — 旧记忆数据一次性迁移到状态记忆
 *
 * 只在 server 启动、`initSchema()` 之后调用一次：按 internal_meta 标记
 * `state_memory_migrated_v1` 判断是否已迁移，已迁移直接返回。
 * 全部数据库写入在一个事务内完成，失败整体回滚并向上抛出（server 启动报错退出，不捕获）；
 * 事务提交后再删除 `data/table_memory/` 目录。全部写入记为第 0 轮。
 *
 * 步骤：
 *   0. 已有世界的默认字段：personality/age/appearance/identity/outfit（含 `_char`
 *      后缀写法）在 character_state_fields 上取消「对 NPC 生效」。
 *   1. 附近角色 → character 实体：已保存置顶，persona 进档案 background 第一项；
 *      五个默认字段的值转入档案对应字段，其余字段原样转入 session_entity_state_values。
 *   2. 四张表（tables.json 当前行）→ 实体 / 关系 / 事项，按名字与别名匹配或新建实体。
 *   0A. 世界当前时间 / 地点（diary_time / location 预设字段，及标签为「时间」「地点」的自建字段）
 *       → state_world_profile；旧条件里的 `世界.<旧标签>` 改写为保留名 `世界.时间` / `世界.地点`；
 *       随后删除这些世界字段及其全部取值。
 *   3. 删除旧表 session_nearby_characters / session_nearby_character_state_values、
 *      turn_records.table_memory_snapshot 列（存在时）。
 *
 * 旧表格快照文件用 fs 直接读 JSON；读到损坏 JSON 时不捕获异常，让迁移失败回滚，而不是静默丢弃旧数据。
 *
 * 除 migrateToStateMemory() 外，其余导出函数只为按迁移阶段拆分成独立的可测/可读单元，
 * 不是给其他模块调用的公共接口。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { DATA_ROOT } from '../utils/data-dir.js';
import { STATE_LIST_ITEM_MAX, STATE_LIST_MAX_ITEMS, STATE_TEXT_FIELD_MAX } from '../utils/constants.js';
import { RESERVED_WORLD_FIELD_LABELS } from '../memory/state-memory-schema.js';
import {
  isStateMemoryMigrated,
  markStateMemoryMigrated,
  runStateMemoryMigrationTransaction,
  listAllSessions,
  listAllWorldIds,
  listLegacyNearbyCharacters,
  listLegacyNearbyStateValues,
  deactivateDefaultNearbyCharacterFields,
  getWorldStateField,
  getWorldStateValue,
  getSessionWorldStateValueRaw,
  rewriteEntryConditionsTargetField,
  deleteWorldStateFieldAndValues,
  dropLegacyNearbyTables,
  dropTableMemorySnapshotColumn,
} from '../db/queries/state-memory-migration.js';
import {
  upsertEntity,
  upsertProfileField,
  upsertDynamicState,
  upsertRelation,
  upsertThread,
  upsertWorldProfile,
  nextEntitySeq,
  nextRelationSeq,
  nextThreadSeq,
} from '../db/queries/state-memory.js';
import { upsertEntityStateValues } from '../db/queries/session-entity-state-values.js';
import { getPersonaById, getPersonaByWorldId } from '../db/queries/personas.js';
import { getWorldStateFieldsByWorldId } from '../db/queries/world-state-fields.js';

const TABLE_MEMORY_DIR = path.join(DATA_ROOT, 'table_memory');
const MIGRATION_ROUND = 0;
const MIGRATION_EVIDENCE = '迁移';
const CHAR_SUFFIX = '_char';
const WORLD_TIME_EMPTY_DEFAULT = '1000-01-01T00:00';
const PLAYER_LITERAL_NAME = '玩家';

const NEARBY_DEFAULT_FIELD_KEYS = ['personality', 'age', 'appearance', 'identity', 'outfit'];
const NEARBY_TO_PROFILE_FIELD = {
  outfit: 'outfit',
  personality: 'core_traits',
  age: 'age_recorded',
  appearance: 'distinguishing_features',
  identity: 'social_identity',
};

// ============================
// 入口
// ============================

export function migrateToStateMemory() {
  if (isStateMemoryMigrated()) return;

  runStateMemoryMigrationTransaction(() => {
    migrateDeactivateDefaultNearbyFields();
    migrateAllSessions();
    migrateAllWorldsTimeLocationFields();
    dropLegacyNearbyTables();
    dropTableMemorySnapshotColumn();
    markStateMemoryMigrated();
  });

  fs.rmSync(TABLE_MEMORY_DIR, { recursive: true, force: true });
}

// ============================
// 第零步：默认字段对 NPC 停用
// ============================

function migrateDeactivateDefaultNearbyFields() {
  const keys = NEARBY_DEFAULT_FIELD_KEYS.flatMap((key) => [key, `${key}${CHAR_SUFFIX}`]);
  deactivateDefaultNearbyCharacterFields(keys);
}

// ============================
// 通用：文本 / 列表截断与写入
// ============================

function parseJsonValue(raw) {
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

function truncateText(value, max) {
  const text = String(value ?? '').trim();
  return text.length > max ? text.slice(0, max) : text;
}

function toListItems(value) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  const text = String(value ?? '').trim();
  return text ? [text] : [];
}

function truncateListForProfile(items) {
  return items
    .slice(0, STATE_LIST_MAX_ITEMS)
    .map((item) => truncateText(item, STATE_LIST_ITEM_MAX))
    .filter(Boolean);
}

function splitNames(raw) {
  return String(raw ?? '').split(/[、，,]/).map((name) => name.trim()).filter(Boolean);
}

function writeProfileText(sessionId, entityId, fieldKey, rawValue) {
  const text = truncateText(rawValue, STATE_TEXT_FIELD_MAX);
  if (!text) return;
  upsertProfileField(sessionId, entityId, fieldKey, JSON.stringify(text), MIGRATION_EVIDENCE, MIGRATION_ROUND);
}

function writeProfileList(sessionId, entityId, fieldKey, rawValue) {
  const items = truncateListForProfile(toListItems(rawValue));
  if (items.length === 0) return;
  upsertProfileField(sessionId, entityId, fieldKey, JSON.stringify(items), MIGRATION_EVIDENCE, MIGRATION_ROUND);
}

function writeDynamicState(sessionId, entityId, key, rawValue) {
  const text = truncateText(rawValue, STATE_TEXT_FIELD_MAX);
  if (!text) return;
  upsertDynamicState(sessionId, entityId, key, text, MIGRATION_ROUND);
}

function addRelation(sessionId, subjectId, predicate, objectId, note) {
  const relationId = crypto.randomUUID();
  const seq = nextRelationSeq(sessionId);
  upsertRelation(sessionId, { relationId, seq, subjectId, predicate, objectId, note: note ?? '' }, MIGRATION_ROUND);
}

// ============================
// 会话内实体登记表：按名字/别名匹配或新建，供第一、二步共用
// ============================

function createEntityRegistry(sessionId) {
  const byId = new Map();
  const byNormalizedName = new Map();

  const normalize = (name) => String(name ?? '').trim().toLowerCase();

  function flush(entityId) {
    const rec = byId.get(entityId);
    upsertEntity(sessionId, {
      entityId,
      seq: rec.seq,
      type: rec.type,
      name: rec.name,
      aliasesJson: JSON.stringify([...rec.aliases]),
      cardId: rec.cardId,
      pinned: rec.pinned,
    }, MIGRATION_ROUND);
  }

  function findByName(name) {
    return byNormalizedName.get(normalize(name)) ?? null;
  }

  function create(type, name, { pinned = false, cardId = null } = {}) {
    const entityId = crypto.randomUUID();
    const seq = nextEntitySeq(sessionId);
    const cleanName = truncateText(name, STATE_TEXT_FIELD_MAX) || String(name ?? '');
    byId.set(entityId, { type, name: cleanName, aliases: new Set(), pinned, seq, cardId });
    byNormalizedName.set(normalize(name), entityId);
    flush(entityId);
    return entityId;
  }

  function findOrCreate(type, name, opts) {
    return findByName(name) ?? create(type, name, opts);
  }

  function addAliases(entityId, names) {
    const rec = byId.get(entityId);
    if (!rec) return;
    let changed = false;
    for (const raw of names) {
      const alias = String(raw ?? '').trim();
      if (!alias || rec.aliases.has(alias)) continue;
      rec.aliases.add(alias);
      changed = true;
      if (!byNormalizedName.has(normalize(alias))) byNormalizedName.set(normalize(alias), entityId);
    }
    if (changed) flush(entityId);
  }

  function markPinned(entityId) {
    const rec = byId.get(entityId);
    if (rec && !rec.pinned) {
      rec.pinned = true;
      flush(entityId);
    }
  }

  return { findByName, findOrCreate, create, addAliases, markPinned };
}

/**
 * 旧数据按名字指代玩家（人设名或字面「玩家」）和对话模式的主角色：先建好这两个实体
 * （命名与 ensureBaseEntities 一致），后续按名字匹配时落到它们身上，而不是另建同名角色。
 */
function seedBaseEntities(session, registry) {
  const persona = session.persona_id
    ? getPersonaById(session.persona_id)
    : (session.world_id ? getPersonaByWorldId(session.world_id) : null);
  const playerName = persona?.name?.trim() || PLAYER_LITERAL_NAME;
  const playerEntityId = registry.create('player', playerName);
  if (playerName !== PLAYER_LITERAL_NAME) registry.addAliases(playerEntityId, [PLAYER_LITERAL_NAME]);

  if (session.mode !== 'writing' && session.character_id) {
    registry.create('character', session.character_name?.trim() || '角色', { cardId: session.character_id });
  }
}

// ============================
// 每会话迁移主流程
// ============================

function migrateAllSessions() {
  const sessions = listAllSessions();
  for (const session of sessions) {
    const registry = createEntityRegistry(session.id);
    seedBaseEntities(session, registry);
    migrateSessionNearbyCharacters(session.id, registry);
    migrateSessionTableMemory(session.id, registry);
    migrateSessionWorldProfile(session.id, session.world_id, registry);
  }
}

// ============================
// 第一步：附近角色 → character 实体
// ============================

export function migrateSessionNearbyCharacters(sessionId, registry) {
  const nearbyRows = listLegacyNearbyCharacters(sessionId);
  for (const nearby of nearbyRows) {
    const entityId = registry.findOrCreate('character', nearby.name, { pinned: !!nearby.is_saved });
    if (nearby.is_saved) registry.markPinned(entityId);
    if (nearby.persona && String(nearby.persona).trim()) {
      writeProfileList(sessionId, entityId, 'background', nearby.persona);
    }
    migrateNearbyStateValues(sessionId, entityId, nearby.id);
  }
}

function migrateNearbyStateValues(sessionId, entityId, nearbyId) {
  const values = listLegacyNearbyStateValues(nearbyId);
  const entityStateRows = [];
  for (const row of values) {
    const baseKey = row.field_key.endsWith(CHAR_SUFFIX)
      ? row.field_key.slice(0, -CHAR_SUFFIX.length)
      : row.field_key;
    const profileField = NEARBY_TO_PROFILE_FIELD[baseKey];
    if (!profileField) {
      entityStateRows.push({ entityId, fieldKey: row.field_key, runtimeValueJson: row.runtime_value_json });
      continue;
    }
    migrateNearbySpecialField(sessionId, entityId, profileField, parseJsonValue(row.runtime_value_json));
  }
  if (entityStateRows.length > 0) upsertEntityStateValues(sessionId, entityStateRows);
}

function migrateNearbySpecialField(sessionId, entityId, profileField, parsedValue) {
  if (profileField !== 'age_recorded') {
    writeProfileList(sessionId, entityId, profileField, parsedValue);
    return;
  }
  const num = Number(Array.isArray(parsedValue) ? parsedValue[0] : parsedValue);
  if (!Number.isFinite(num)) return;
  upsertProfileField(
    sessionId, entityId, 'age_recorded',
    JSON.stringify({ age: num, as_of_round: MIGRATION_ROUND }),
    MIGRATION_EVIDENCE, MIGRATION_ROUND,
  );
}

// ============================
// 第二步：四张表 → 实体 / 关系 / 事项
// ============================

function readSessionTables(sessionId) {
  const filePath = path.join(TABLE_MEMORY_DIR, sessionId, 'tables.json');
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (!raw.trim()) return null;
  // 不捕获 JSON.parse 异常：损坏的旧快照应让本次迁移失败回滚，而不是静默丢弃。
  return JSON.parse(raw);
}

export function migrateSessionTableMemory(sessionId, registry) {
  const data = readSessionTables(sessionId);
  if (!data || !data.tables) return;
  migrateRelationsTable(sessionId, registry, data.tables.relations?.rows ?? []);
  migrateItemsTable(sessionId, registry, data.tables.items?.rows ?? []);
  migratePlacesTable(sessionId, registry, data.tables.places?.rows ?? []);
  migrateFactionsTable(sessionId, registry, data.tables.factions?.rows ?? []);
}

export function migrateRelationsTable(sessionId, registry, rows) {
  for (const row of rows) {
    const nameA = row['主体A'];
    const nameB = row['主体B'];
    if (!nameA || !nameB) continue;
    const entityA = registry.findOrCreate('character', nameA);
    const entityB = registry.findOrCreate('character', nameB);
    if (row['别名']) registry.addAliases(entityA, splitNames(row['别名']));
    migrateRelationRow(sessionId, entityA, entityB, row);
  }
}

function migrateRelationRow(sessionId, entityA, entityB, row) {
  const predicate = truncateText(row['关系类型'], STATE_TEXT_FIELD_MAX);
  if (predicate) {
    addRelation(sessionId, entityA, predicate, entityB, truncateText(row['信任/敌意'], STATE_TEXT_FIELD_MAX));
  }
  const promise = row['债务/承诺'];
  if (promise && String(promise).trim()) {
    const threadId = crypto.randomUUID();
    const seq = nextThreadSeq(sessionId);
    upsertThread(sessionId, {
      threadId, seq, kind: '承诺',
      participantsJson: JSON.stringify([entityA, entityB]),
      content: truncateText(promise, STATE_TEXT_FIELD_MAX),
      status: 'active', openedRound: MIGRATION_ROUND,
    }, MIGRATION_ROUND);
  }
}

export function migrateItemsTable(sessionId, registry, rows) {
  for (const row of rows) {
    const name = row['物品'];
    if (!name) continue;
    const entityId = registry.findOrCreate('item', name);
    if (row['别名']) registry.addAliases(entityId, splitNames(row['别名']));
    writeProfileText(sessionId, entityId, 'category', row['类型']);
    writeProfileList(sessionId, entityId, 'effects', row['效果/用途']);
    writeProfileList(sessionId, entityId, 'limits', row['限制条件']);
    migrateItemHolder(sessionId, registry, entityId, row['持有人/位置']);
    writeDynamicState(sessionId, entityId, '状态', row['状态']);
  }
}

function migrateItemHolder(sessionId, registry, itemEntityId, holderName) {
  if (!holderName || !String(holderName).trim()) return;
  const holderEntityId = registry.findByName(holderName);
  if (holderEntityId) {
    addRelation(sessionId, itemEntityId, '持有者', holderEntityId);
  } else {
    writeDynamicState(sessionId, itemEntityId, '位置', holderName);
  }
}

export function migratePlacesTable(sessionId, registry, rows) {
  for (const row of rows) {
    const name = row['地点'];
    if (!name) continue;
    const entityId = registry.findOrCreate('location', name);
    if (row['别名']) registry.addAliases(entityId, splitNames(row['别名']));
    writeDynamicState(sessionId, entityId, '状态', row['当前状态']);
    writeProfileList(sessionId, entityId, 'features', row['危险/资源']);
    writeProfileText(sessionId, entityId, 'description', row['历史标记']);
    migratePlaceFaction(sessionId, registry, entityId, row['所属势力']);
  }
}

function migratePlaceFaction(sessionId, registry, locationEntityId, factionName) {
  if (!factionName || !String(factionName).trim()) return;
  const factionEntityId = registry.findOrCreate('faction', factionName);
  addRelation(sessionId, locationEntityId, '控制者', factionEntityId);
}

export function migrateFactionsTable(sessionId, registry, rows) {
  for (const row of rows) {
    const name = row['势力'];
    if (!name) continue;
    const entityId = registry.findOrCreate('faction', name);
    if (row['别名']) registry.addAliases(entityId, splitNames(row['别名']));
    writeProfileText(sessionId, entityId, 'category', row['类型/性质']);
    writeProfileText(sessionId, entityId, 'scope', row['控制范围']);
    writeDynamicState(sessionId, entityId, '实力', row['当前实力']);
    writeDynamicState(sessionId, entityId, '立场', row['立场']);
    migrateFactionMembers(sessionId, registry, entityId, row['核心人物']);
  }
}

function migrateFactionMembers(sessionId, registry, factionEntityId, raw) {
  const names = splitNames(raw);
  for (const name of names) {
    const memberId = registry.findOrCreate('character', name);
    addRelation(sessionId, memberId, '成员', factionEntityId);
  }
}

// ============================
// 第零步 A：世界当前时间 / 地点
// ============================

function resolveWorldFieldFallback(worldId, fieldKey) {
  const valueRow = getWorldStateValue(worldId, fieldKey);
  if (valueRow) {
    const effective = parseJsonValue(valueRow.runtime_value_json ?? valueRow.default_value_json);
    if (typeof effective === 'string' && effective.trim()) return effective;
  }
  const field = getWorldStateField(worldId, fieldKey);
  return field?.default_value || null;
}

function resolveSessionFieldValue(sessionId, worldId, fieldKey) {
  const sessionRaw = getSessionWorldStateValueRaw(sessionId, worldId, fieldKey);
  if (sessionRaw != null) {
    const parsed = parseJsonValue(sessionRaw);
    if (typeof parsed === 'string' && parsed.trim()) return parsed;
  }
  return resolveWorldFieldFallback(worldId, fieldKey);
}

/**
 * 世界里承担「时间」「地点」的字段：field_key 为 diary_time / location 的预设字段，
 * 以及标签为「时间」「地点」的自建字段。取值优先用预设字段，没有时用第一个同名自建字段。
 */
function resolveTimeLocationFields(worldId) {
  const fields = getWorldStateFieldsByWorldId(worldId);
  const pick = (fieldKey, label) => {
    const matched = fields.filter((f) => f.field_key === fieldKey || f.label?.trim() === label);
    const primary = matched.find((f) => f.field_key === fieldKey) ?? matched[0] ?? null;
    return { primaryKey: primary?.field_key ?? null, fields: matched };
  };
  return {
    time: pick('diary_time', RESERVED_WORLD_FIELD_LABELS[0]),
    location: pick('location', RESERVED_WORLD_FIELD_LABELS[1]),
  };
}

export function migrateSessionWorldProfile(sessionId, worldId, registry) {
  if (!worldId) return;
  const { time: timeFields, location: locationFields } = resolveTimeLocationFields(worldId);
  const time = timeFields.primaryKey ? resolveSessionFieldValue(sessionId, worldId, timeFields.primaryKey) : null;
  const location = locationFields.primaryKey
    ? resolveSessionFieldValue(sessionId, worldId, locationFields.primaryKey)
    : null;
  const locationEntityId = location ? registry.findByName(location) : null;
  upsertWorldProfile(sessionId, 'time', time !== WORLD_TIME_EMPTY_DEFAULT ? time : null, null, MIGRATION_ROUND);
  upsertWorldProfile(sessionId, 'location', location, locationEntityId, MIGRATION_ROUND);
}

// ============================
// 第零步 A（续）：删除两个世界字段，改写引用它们的条目条件
// ============================

// guard-allow(perf-shape): 一次性数据迁移，由 internal_meta 标记保证只跑一次；每个世界匹配到的字段通常只有一个
function migrateWorldFieldsToReserved(worldId, fields, reservedLabel) {
  for (const field of fields) {
    rewriteEntryConditionsTargetField(worldId, `世界.${field.label}`, `世界.${reservedLabel}`);
    deleteWorldStateFieldAndValues(worldId, field.field_key);
  }
}

function migrateAllWorldsTimeLocationFields() {
  const worldIds = listAllWorldIds();
  for (const worldId of worldIds) {
    const { time, location } = resolveTimeLocationFields(worldId);
    migrateWorldFieldsToReserved(worldId, time.fields, RESERVED_WORLD_FIELD_LABELS[0]);
    migrateWorldFieldsToReserved(worldId, location.fields, RESERVED_WORLD_FIELD_LABELS[1]);
  }
}
