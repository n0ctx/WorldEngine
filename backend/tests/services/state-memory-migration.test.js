import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import {
  insertWorld,
  insertSession,
  insertCharacterStateField,
  insertWorldStateField,
  insertSessionWorldStateValue,
  insertWorldEntry,
  insertEntryCondition,
  insertTurnRecord,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('state-memory-migration');
sandbox.setEnv();

const {
  migrateToStateMemory,
  migrateSessionNearbyCharacters,
  migrateSessionTableMemory,
  migrateRelationsTable,
  migrateItemsTable,
  migratePlacesTable,
  migrateFactionsTable,
  migrateSessionWorldProfile,
} = await freshImport('backend/services/state-memory-migration.js');
const { default: db } = await freshImport('backend/db/index.js');

test.after(() => sandbox.cleanup());

/**
 * schema.js 已不再建这两张旧表：迁移测试需要在沙箱库里自行按删除前的结构建出旧表，
 * 再插入旧数据，才能验证迁移读取旧表并清理的行为。
 */
function createLegacyNearbyTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_nearby_characters (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      persona     TEXT NOT NULL DEFAULT '',
      is_saved    INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      UNIQUE(session_id, name)
    );
    CREATE TABLE IF NOT EXISTS session_nearby_character_state_values (
      id                 TEXT PRIMARY KEY,
      session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      nearby_id          TEXT NOT NULL REFERENCES session_nearby_characters(id) ON DELETE CASCADE,
      field_key          TEXT NOT NULL,
      runtime_value_json TEXT,
      updated_at         INTEGER NOT NULL,
      UNIQUE(nearby_id, field_key)
    );
  `);
}
createLegacyNearbyTables();

function insertNearbyCharacter(db, sessionId, patch = {}) {
  const id = patch.id ?? crypto.randomUUID();
  const now = patch.created_at ?? Date.now();
  db.prepare(`
    INSERT INTO session_nearby_characters (id, session_id, name, persona, is_saved, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    sessionId,
    patch.name ?? '临时角色',
    patch.persona ?? '',
    patch.is_saved ?? 0,
    now,
    patch.updated_at ?? now,
  );
  return { id, session_id: sessionId, ...patch, created_at: now, updated_at: patch.updated_at ?? now };
}

function insertNearbyStateValue(db, sessionId, nearbyId, patch = {}) {
  const id = patch.id ?? crypto.randomUUID();
  const now = patch.updated_at ?? Date.now();
  db.prepare(`
    INSERT INTO session_nearby_character_state_values (id, session_id, nearby_id, field_key, runtime_value_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    sessionId,
    nearbyId,
    patch.field_key ?? 'field',
    patch.runtime_value_json ?? null,
    now,
  );
  return { id, session_id: sessionId, nearby_id: nearbyId, ...patch, updated_at: now };
}

/**
 * 迁移步骤函数的最小 registry 替身：只实现 findOrCreate/findByName/addAliases/markPinned
 * 四个接口方法，不做真正的实体落库（真正的 upsertEntity 行为已由 createEntityRegistry
 * 在完整迁移场景测试里覆盖）。用于单独验证每个迁移步骤函数自身的字段映射与写入逻辑。
 */
function makeStubRegistry() {
  const byName = new Map();
  const calls = { findOrCreate: [], addAliases: [], markPinned: [] };
  const normalize = (name) => String(name ?? '').trim().toLowerCase();
  return {
    calls,
    findByName(name) { return byName.get(normalize(name)) ?? null; },
    findOrCreate(type, name) {
      calls.findOrCreate.push({ type, name });
      const key = normalize(name);
      if (!byName.has(key)) byName.set(key, crypto.randomUUID());
      return byName.get(key);
    },
    addAliases(entityId, names) { calls.addAliases.push({ entityId, names }); },
    markPinned(entityId) { calls.markPinned.push(entityId); },
  };
}

function writeTablesJson(sessionId, raw) {
  const dir = path.join(sandbox.root, 'table_memory', sessionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'tables.json'), raw, 'utf-8');
}

function currentEntities(sessionId) {
  return db.prepare('SELECT * FROM state_entities WHERE session_id = ? AND valid_to_round IS NULL ORDER BY seq')
    .all(sessionId);
}

function entityByName(sessionId, name) {
  return currentEntities(sessionId).find((row) => row.name === name);
}

function profileValue(sessionId, entityId, fieldKey) {
  const row = db.prepare(`
    SELECT value_json, evidence FROM state_profile_fields
    WHERE session_id = ? AND entity_id = ? AND field_key = ? AND valid_to_round IS NULL
  `).get(sessionId, entityId, fieldKey);
  return row ? { value: JSON.parse(row.value_json), evidence: row.evidence } : null;
}

function dynamicValue(sessionId, entityId, key) {
  return db.prepare(`
    SELECT value FROM state_dynamic WHERE session_id = ? AND entity_id = ? AND key = ? AND valid_to_round IS NULL
  `).get(sessionId, entityId, key)?.value ?? null;
}

function relationsOf(sessionId) {
  return db.prepare(`
    SELECT * FROM state_relations WHERE session_id = ? AND valid_to_round IS NULL ORDER BY seq
  `).all(sessionId);
}

function threadsOf(sessionId) {
  return db.prepare(`
    SELECT * FROM state_threads WHERE session_id = ? AND valid_to_round IS NULL ORDER BY seq
  `).all(sessionId);
}

function worldProfileOf(sessionId) {
  const rows = db.prepare(`
    SELECT key, value, location_entity_id FROM state_world_profile
    WHERE session_id = ? AND valid_to_round IS NULL
  `).all(sessionId);
  return Object.fromEntries(rows.map((r) => [r.key, r]));
}

function migrationMarker() {
  return db.prepare(`SELECT value FROM internal_meta WHERE key = 'state_memory_migrated_v1'`).get()?.value ?? null;
}

// ============================
// 单独调用各迁移步骤函数：验证字段映射与写入逻辑本身（独立于完整流程的实体匹配）。
// 放在完整场景测试之前，因为完整场景测试执行后旧的 session_nearby_characters 表会被删除。
// ============================

test('migrateSessionNearbyCharacters 单独调用：置顶与档案字段直接落库', () => {
  const world = insertWorld(db);
  const session = insertSession(db, { world_id: world.id, mode: 'writing' });
  const nearby = insertNearbyCharacter(db, session.id, { name: '孤立测试角色', persona: '一句话人设', is_saved: 1 });
  insertNearbyStateValue(db, session.id, nearby.id, { field_key: 'mood', runtime_value_json: JSON.stringify('平静') });

  const registry = makeStubRegistry();
  migrateSessionNearbyCharacters(session.id, registry);

  assert.equal(registry.calls.findOrCreate.length, 1);
  assert.equal(registry.calls.markPinned.length, 1);
  const entityId = registry.calls.markPinned[0];
  assert.deepEqual(profileValue(session.id, entityId, 'background').value, ['一句话人设']);
  const stateRows = db.prepare('SELECT field_key FROM session_entity_state_values WHERE entity_id = ?').all(entityId);
  assert.deepEqual(stateRows.map((r) => r.field_key), ['mood']);
});

test('migrateRelationsTable 单独调用：建立关系与承诺事项', () => {
  const world = insertWorld(db);
  const session = insertSession(db, { world_id: world.id, mode: 'writing' });
  const registry = makeStubRegistry();
  migrateRelationsTable(session.id, registry, [
    { 主体A: '甲', 主体B: '乙', 关系类型: '同门', '信任/敌意': '信任', '债务/承诺': '甲欠乙一个人情' },
  ]);
  const relations = relationsOf(session.id);
  assert.equal(relations.length, 1);
  assert.equal(relations[0].predicate, '同门');
  const threads = threadsOf(session.id);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].kind, '承诺');
});

test('migrateItemsTable 单独调用：档案字段、动态状态与持有者关系', () => {
  const world = insertWorld(db);
  const session = insertSession(db, { world_id: world.id, mode: 'writing' });
  const registry = makeStubRegistry();
  const ownerId = registry.findOrCreate('character', '持有人');
  migrateItemsTable(session.id, registry, [
    { 物品: '测试法器', '持有人/位置': '持有人', 类型: '法宝', '效果/用途': '发光', 状态: '完好' },
  ]);
  const itemId = registry.findByName('测试法器');
  assert.deepEqual(profileValue(session.id, itemId, 'category').value, '法宝');
  assert.equal(dynamicValue(session.id, itemId, '状态'), '完好');
  const relation = relationsOf(session.id).find((r) => r.predicate === '持有者');
  assert.equal(relation.subject_id, itemId);
  assert.equal(relation.object_id, ownerId);
});

test('migratePlacesTable 单独调用：动态状态、档案字段与控制者关系', () => {
  const world = insertWorld(db);
  const session = insertSession(db, { world_id: world.id, mode: 'writing' });
  const registry = makeStubRegistry();
  migratePlacesTable(session.id, registry, [
    { 地点: '测试驿站', 所属势力: '测试镖局', 当前状态: '正常营业', '危险/资源': '无', 历史标记: '曾遭劫' },
  ]);
  const placeId = registry.findByName('测试驿站');
  assert.equal(dynamicValue(session.id, placeId, '状态'), '正常营业');
  assert.deepEqual(profileValue(session.id, placeId, 'description').value, '曾遭劫');
  const relation = relationsOf(session.id).find((r) => r.predicate === '控制者');
  assert.equal(relation.subject_id, placeId);
  assert.equal(relation.object_id, registry.findByName('测试镖局'));
});

test('migrateFactionsTable 单独调用：档案字段、动态状态与成员关系', () => {
  const world = insertWorld(db);
  const session = insertSession(db, { world_id: world.id, mode: 'writing' });
  const registry = makeStubRegistry();
  migrateFactionsTable(session.id, registry, [
    { 势力: '测试镖局', '类型/性质': '镖行', 控制范围: '本城', 核心人物: '甲、乙', 当前实力: '中等', 立场: '中立' },
  ]);
  const factionId = registry.findByName('测试镖局');
  assert.deepEqual(profileValue(session.id, factionId, 'scope').value, '本城');
  assert.equal(dynamicValue(session.id, factionId, '实力'), '中等');
  const members = relationsOf(session.id).filter((r) => r.predicate === '成员' && r.object_id === factionId);
  assert.equal(members.length, 2);
});

test('migrateSessionTableMemory 单独调用：按四张表分派并跳过无文件的会话', () => {
  const world = insertWorld(db);
  const session = insertSession(db, { world_id: world.id, mode: 'writing' });
  const emptySession = insertSession(db, { world_id: world.id, mode: 'writing' });
  writeTablesJson(session.id, JSON.stringify({
    version: 1,
    tables: { relations: { rows: [{ 主体A: '丙', 主体B: '丁', 关系类型: '相识' }] }, items: {}, places: {}, factions: {} },
  }));

  const registry = makeStubRegistry();
  migrateSessionTableMemory(session.id, registry);
  assert.equal(relationsOf(session.id).length, 1);

  const emptyRegistry = makeStubRegistry();
  assert.doesNotThrow(() => migrateSessionTableMemory(emptySession.id, emptyRegistry));
  assert.equal(relationsOf(emptySession.id).length, 0);
});

test('migrateSessionWorldProfile 单独调用：写入世界档案并关联地点实体', () => {
  const world = insertWorld(db);
  const session = insertSession(db, { world_id: world.id, mode: 'writing' });
  insertWorldStateField(db, world.id, { field_key: 'diary_time', label: '时间', type: 'datetime', default_value: '1000-01-01T00:00' });
  insertWorldStateField(db, world.id, { field_key: 'location', label: '地点', type: 'text', default_value: '' });
  insertSessionWorldStateValue(db, session.id, world.id, { field_key: 'diary_time', runtime_value_json: JSON.stringify('1000-05-01T12:00') });
  insertSessionWorldStateValue(db, session.id, world.id, { field_key: 'location', runtime_value_json: JSON.stringify('测试地点') });

  const registry = makeStubRegistry();
  const placeId = registry.findOrCreate('location', '测试地点');
  migrateSessionWorldProfile(session.id, world.id, registry);

  const profile = worldProfileOf(session.id);
  assert.equal(profile.time.value, '1000-05-01T12:00');
  assert.equal(profile.location.value, '测试地点');
  assert.equal(profile.location.location_entity_id, placeId);
});

test('完整旧数据迁移：附近角色、四张表、世界档案、条件改写与旧结构清理', () => {
  const world = insertWorld(db);
  const session = insertSession(db, { world_id: world.id, mode: 'writing' });

  // 五个默认字段 + 一个自定义字段，全部 nearby_enabled 默认 1
  insertCharacterStateField(db, world.id, { field_key: 'personality', label: '性格' });
  insertCharacterStateField(db, world.id, { field_key: 'age', label: '年龄' });
  insertCharacterStateField(db, world.id, { field_key: 'appearance', label: '外貌' });
  insertCharacterStateField(db, world.id, { field_key: 'identity', label: '身份' });
  insertCharacterStateField(db, world.id, { field_key: 'outfit', label: '穿着' });
  insertCharacterStateField(db, world.id, { field_key: 'mood', label: '心情' });

  // 附近角色：已保存 NPC 沈彦（五个默认字段 + 一个自定义字段），临时角色路人甲（字符串型 outfit）
  const shenyan = insertNearbyCharacter(db, session.id, {
    name: '沈彦', persona: '退役军人，沉默寡言，做事克制到近乎冷酷的地步', is_saved: 1,
  });
  insertNearbyStateValue(db, session.id, shenyan.id, { field_key: 'personality', runtime_value_json: JSON.stringify(['克制', '多疑']) });
  insertNearbyStateValue(db, session.id, shenyan.id, { field_key: 'age', runtime_value_json: JSON.stringify('34') });
  insertNearbyStateValue(db, session.id, shenyan.id, { field_key: 'appearance', runtime_value_json: JSON.stringify('高瘦') });
  insertNearbyStateValue(db, session.id, shenyan.id, { field_key: 'identity', runtime_value_json: JSON.stringify('退役军人') });
  insertNearbyStateValue(db, session.id, shenyan.id, { field_key: 'outfit', runtime_value_json: JSON.stringify(['黑色风衣']) });
  insertNearbyStateValue(db, session.id, shenyan.id, { field_key: 'mood', runtime_value_json: JSON.stringify('紧张') });

  const passerby = insertNearbyCharacter(db, session.id, { name: '路人甲', persona: '', is_saved: 0 });
  insertNearbyStateValue(db, session.id, passerby.id, { field_key: 'outfit', runtime_value_json: JSON.stringify('旧衣服') });

  // 四张表：relations 引用已存在的「沈彦」（应复用同一实体，不新建）
  writeTablesJson(session.id, JSON.stringify({
    version: 1,
    tables: {
      relations: {
        rows: [{
          id: 1, 主体A: '沈彦', 主体B: '林乔', 关系类型: '旧识', '信任/敌意': '信任',
          '债务/承诺': '林乔答应三日内帮忙找回账本',
        }],
        nextId: 2,
      },
      items: {
        rows: [
          { id: 1, 物品: '银戒指', '持有人/位置': '沈彦', 类型: '饰品', '效果/用途': '强化守护', 状态: '完好', 别名: '戒指' },
          { id: 2, 物品: '神秘匕首', '持有人/位置': '黑市', 类型: '武器', '效果/用途': '未知', 状态: '封存' },
        ],
        nextId: 3,
      },
      places: {
        rows: [{
          id: 1, 地点: '旧港仓库', 所属势力: '黑潮会', 当前状态: '废弃', '危险/资源': '阴暗潮湿', 历史标记: '曾是走私据点',
        }],
        nextId: 2,
      },
      factions: {
        rows: [{
          id: 1, 势力: '黑潮会', '类型/性质': '走私团伙', 控制范围: '旧港区', 核心人物: '沈彦、林乔', 当前实力: '中等', 立场: '中立',
        }],
        nextId: 2,
      },
    },
    archive: { relations: [{ id: 99, 主体A: '已归档甲', 主体B: '已归档乙' }], items: [], places: [], factions: [] },
  }));

  // 世界时间/地点：用户改过标签，会话值优先于字段默认值
  const timeField = insertWorldStateField(db, world.id, {
    field_key: 'diary_time', label: '纪元', type: 'datetime', default_value: '1000-01-01T00:00',
  });
  const locationField = insertWorldStateField(db, world.id, {
    field_key: 'location', label: '方位', type: 'text', default_value: '',
  });
  insertSessionWorldStateValue(db, session.id, world.id, {
    field_key: 'diary_time', runtime_value_json: JSON.stringify('1000-03-16T08:00'),
  });
  insertSessionWorldStateValue(db, session.id, world.id, {
    field_key: 'location', runtime_value_json: JSON.stringify('旧港仓库'),
  });

  // 条目条件引用旧标签
  const entry = insertWorldEntry(db, world.id);
  insertEntryCondition(db, entry.id, { target_field: `世界.${timeField.label}`, operator: '>', value: '1000-01-01T00:00' });
  insertEntryCondition(db, entry.id, { target_field: `世界.${locationField.label}`, operator: '=', value: '旧港仓库' });

  insertTurnRecord(db, session.id, { round_index: 1, table_memory_snapshot: '{"legacy":true}' });

  migrateToStateMemory();

  // 第零步：五个默认字段（含自定义 mood 字段不受影响）
  const fields = db.prepare('SELECT field_key, nearby_enabled FROM character_state_fields WHERE world_id = ?').all(world.id);
  const fieldMap = Object.fromEntries(fields.map((f) => [f.field_key, f.nearby_enabled]));
  assert.equal(fieldMap.personality, 0);
  assert.equal(fieldMap.age, 0);
  assert.equal(fieldMap.appearance, 0);
  assert.equal(fieldMap.identity, 0);
  assert.equal(fieldMap.outfit, 0);
  assert.equal(fieldMap.mood, 1);

  // 第一步：沈彦 —— 置顶、档案字段、其余字段进 session_entity_state_values
  const shenyanEntity = entityByName(session.id, '沈彦');
  assert.ok(shenyanEntity);
  assert.equal(shenyanEntity.type, 'character');
  assert.equal(shenyanEntity.pinned, 1);

  const background = profileValue(session.id, shenyanEntity.entity_id, 'background');
  assert.deepEqual(background.value, ['退役军人，沉默寡言，做事克制到近乎冷酷的地步']);
  assert.equal(background.evidence, '迁移');
  assert.deepEqual(profileValue(session.id, shenyanEntity.entity_id, 'core_traits').value, ['克制', '多疑']);
  assert.deepEqual(profileValue(session.id, shenyanEntity.entity_id, 'age_recorded').value, { age: 34, as_of_round: 0 });
  assert.deepEqual(profileValue(session.id, shenyanEntity.entity_id, 'distinguishing_features').value, ['高瘦']);
  assert.deepEqual(profileValue(session.id, shenyanEntity.entity_id, 'social_identity').value, ['退役军人']);
  assert.deepEqual(profileValue(session.id, shenyanEntity.entity_id, 'outfit').value, ['黑色风衣']);

  const shenyanStateValues = db.prepare(
    'SELECT field_key, runtime_value_json FROM session_entity_state_values WHERE entity_id = ?',
  ).all(shenyanEntity.entity_id);
  assert.deepEqual(shenyanStateValues, [{ field_key: 'mood', runtime_value_json: JSON.stringify('紧张') }]);

  // 临时角色：字符串型 outfit 转成单项 list
  const passerbyEntity = entityByName(session.id, '路人甲');
  assert.ok(passerbyEntity);
  assert.equal(passerbyEntity.pinned, 0);
  assert.deepEqual(profileValue(session.id, passerbyEntity.entity_id, 'outfit').value, ['旧衣服']);
  assert.equal(profileValue(session.id, passerbyEntity.entity_id, 'background'), null);

  // 第二步：relations 复用已存在的「沈彦」实体，新建「林乔」
  const linqiao = entityByName(session.id, '林乔');
  assert.ok(linqiao);
  assert.equal(linqiao.type, 'character');

  const relations = relationsOf(session.id);
  const shenyanLinqiao = relations.find((r) => r.subject_id === shenyanEntity.entity_id && r.predicate === '旧识');
  assert.ok(shenyanLinqiao);
  assert.equal(shenyanLinqiao.object_id, linqiao.entity_id);
  assert.equal(shenyanLinqiao.note, '信任');

  const threads = threadsOf(session.id);
  const promiseThread = threads.find((t) => t.kind === '承诺');
  assert.ok(promiseThread);
  assert.equal(promiseThread.content, '林乔答应三日内帮忙找回账本');
  assert.deepEqual(JSON.parse(promiseThread.participants_json).sort(), [shenyanEntity.entity_id, linqiao.entity_id].sort());

  // items：持有人匹配到实体 → 持有者关系；未匹配 → 动态状态「位置」
  const ring = entityByName(session.id, '银戒指');
  assert.ok(ring);
  assert.equal(ring.aliases_json, JSON.stringify(['戒指']));
  assert.deepEqual(profileValue(session.id, ring.entity_id, 'category').value, '饰品');
  assert.deepEqual(profileValue(session.id, ring.entity_id, 'effects').value, ['强化守护']);
  assert.equal(dynamicValue(session.id, ring.entity_id, '状态'), '完好');
  const ringRelation = relations.find((r) => r.subject_id === ring.entity_id && r.predicate === '持有者');
  assert.ok(ringRelation);
  assert.equal(ringRelation.object_id, shenyanEntity.entity_id);

  const dagger = entityByName(session.id, '神秘匕首');
  assert.ok(dagger);
  assert.equal(dynamicValue(session.id, dagger.entity_id, '位置'), '黑市');
  assert.ok(!relations.some((r) => r.subject_id === dagger.entity_id));

  // places：所属势力未在 places 阶段建过 → 新建 faction，随后被 factions 表复用（不重复建）
  const dock = entityByName(session.id, '旧港仓库');
  assert.ok(dock);
  assert.equal(dock.type, 'location');
  assert.equal(dynamicValue(session.id, dock.entity_id, '状态'), '废弃');
  assert.deepEqual(profileValue(session.id, dock.entity_id, 'features').value, ['阴暗潮湿']);
  assert.deepEqual(profileValue(session.id, dock.entity_id, 'description').value, '曾是走私据点');

  const faction = entityByName(session.id, '黑潮会');
  assert.ok(faction);
  assert.equal(faction.type, 'faction');
  const dockRelation = relations.find((r) => r.subject_id === dock.entity_id && r.predicate === '控制者');
  assert.ok(dockRelation);
  assert.equal(dockRelation.object_id, faction.entity_id);

  // factions：势力档案 + 核心人物成员关系（沈彦复用，林乔复用）
  assert.deepEqual(profileValue(session.id, faction.entity_id, 'category').value, '走私团伙');
  assert.deepEqual(profileValue(session.id, faction.entity_id, 'scope').value, '旧港区');
  assert.equal(dynamicValue(session.id, faction.entity_id, '实力'), '中等');
  assert.equal(dynamicValue(session.id, faction.entity_id, '立场'), '中立');
  const memberRelations = relations.filter((r) => r.predicate === '成员' && r.object_id === faction.entity_id);
  assert.deepEqual(
    memberRelations.map((r) => r.subject_id).sort(),
    [shenyanEntity.entity_id, linqiao.entity_id].sort(),
  );

  // 归档行不迁移
  assert.equal(entityByName(session.id, '已归档甲'), undefined);

  // 实体总数：沈彦、路人甲、林乔、银戒指、神秘匕首、旧港仓库、黑潮会 = 7
  assert.equal(currentEntities(session.id).length, 7);

  // 第零步 A：世界档案与地点关联
  const worldProfile = worldProfileOf(session.id);
  assert.equal(worldProfile.time.value, '1000-03-16T08:00');
  assert.equal(worldProfile.location.value, '旧港仓库');
  assert.equal(worldProfile.location.location_entity_id, dock.entity_id);

  // 条目条件改写为保留名
  const conditions = db.prepare('SELECT target_field FROM entry_conditions WHERE entry_id = ? ORDER BY target_field')
    .all(entry.id);
  assert.deepEqual(conditions.map((c) => c.target_field), ['世界.地点', '世界.时间']);

  // 世界字段与全部取值被删除
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM world_state_fields WHERE world_id = ? AND field_key IN (?, ?)')
      .get(world.id, 'diary_time', 'location').n,
    0,
  );
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM session_world_state_values WHERE session_id = ? AND field_key IN (?, ?)')
      .get(session.id, 'diary_time', 'location').n,
    0,
  );

  // 第三步：旧表与旧列被删，table_memory 目录被删
  assert.equal(
    db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_nearby_characters'`).get(),
    undefined,
  );
  assert.equal(
    db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session_nearby_character_state_values'`).get(),
    undefined,
  );
  assert.ok(!db.pragma('table_info(turn_records)').some((c) => c.name === 'table_memory_snapshot'));
  assert.equal(fs.existsSync(path.join(sandbox.root, 'table_memory')), false);

  assert.equal(migrationMarker(), '1');

  // 重复执行不做第二次
  migrateToStateMemory();
  assert.equal(currentEntities(session.id).length, 7);
});
