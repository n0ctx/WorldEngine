import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import { insertCharacterStateField, insertPersonaStateField, insertWorld } from '../helpers/fixtures.js';

const sandbox = createTestSandbox('memory-state-memory-schema');
sandbox.setEnv();

after(() => sandbox.cleanup());

const {
  ENTITY_TYPES,
  getProfileFieldDefinitions,
  resolveActiveProfileFields,
  isPlaceholderValue,
  THREAD_KINDS,
  EXCLUSIVE_PREDICATES,
  DYNAMIC_LOCATION_KEY,
  WORLD_PROFILE_KEYS,
  RESERVED_WORLD_FIELD_LABELS,
} = await freshImport('backend/memory/state-memory-schema.js');

// ─── 静态定义 ─────────────────────────────────────────────

test('ENTITY_TYPES 覆盖六种实体类型', () => {
  assert.deepEqual(ENTITY_TYPES, ['character', 'location', 'item', 'faction', 'other', 'player']);
});

test('player 有角色的身份与外貌档案字段、没有人格；非 character 类型字段全部 semi_stable', () => {
  const expected = getProfileFieldDefinitions('character').filter((f) => f.group !== '人格');
  assert.deepEqual(getProfileFieldDefinitions('player'), expected);
  assert.ok(expected.some((f) => f.key === 'outfit') && expected.some((f) => f.key === 'gender'));
  for (const type of ['location', 'item', 'faction', 'other']) {
    const fields = getProfileFieldDefinitions(type);
    assert.ok(fields.length > 0, `${type} 应有字段`);
    for (const field of fields) {
      assert.equal(field.mutability, 'semi_stable');
    }
  }
});

test('character 档案字段的可变性与分组符合设计', () => {
  const fields = getProfileFieldDefinitions('character');
  const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));

  assert.equal(byKey.core_traits.highBar, true);
  assert.equal(byKey.values.highBar, true);
  assert.equal(byKey.background.appendOnly, true);
  assert.equal(byKey.outfit.mutability, 'dynamic');
  assert.equal(byKey.gender.mutability, 'immutable');
  assert.equal(byKey.occupation.mutability, 'semi_stable');

  for (const key of ['gender', 'birth_date', 'age_recorded', 'species', 'origin', 'occupation', 'social_identity', 'background']) {
    assert.equal(byKey[key].group, '身份');
  }
  for (const key of ['height', 'build', 'hair', 'eyes', 'distinguishing_features', 'outfit']) {
    assert.equal(byKey[key].group, '外貌');
  }
  for (const key of ['core_traits', 'behavioral_patterns', 'values', 'speech_style']) {
    assert.equal(byKey[key].group, '人格');
  }
});

test('外貌组字段共享同义词', () => {
  const fields = getProfileFieldDefinitions('character');
  const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
  for (const key of ['height', 'build', 'hair', 'eyes', 'distinguishing_features']) {
    assert.deepEqual(byKey[key].synonyms, ['外貌', 'appearance']);
  }
});

test('THREAD_KINDS / EXCLUSIVE_PREDICATES / 世界档案常量', () => {
  assert.deepEqual(THREAD_KINDS, ['承诺', '任务', '债务', '冲突', '谜团', '威胁', '计划', '目标']);
  assert.deepEqual(EXCLUSIVE_PREDICATES, ['持有者', '控制者']);
  assert.equal(DYNAMIC_LOCATION_KEY, '位置');
  assert.deepEqual(WORLD_PROFILE_KEYS, ['time', 'location']);
  assert.deepEqual(RESERVED_WORLD_FIELD_LABELS, ['时间', '地点']);
});

// ─── isPlaceholderValue ─────────────────────────────────────────────

test('isPlaceholderValue 识别占位值，去空白且不区分大小写', () => {
  for (const value of ['unknown', 'Unknown', ' NONE ', 'null', 'N/A', '未知', '不明', '暂无', '无', '空', '待定', '？', '', '   ']) {
    assert.equal(isPlaceholderValue(value), true, `${JSON.stringify(value)} 应视为占位值`);
  }
  for (const value of ['沈彦', '前海军军官', '未知的宝藏']) {
    assert.equal(isPlaceholderValue(value), false, `${JSON.stringify(value)} 不应视为占位值`);
  }
});

test('isPlaceholderValue 接受非字符串值：null/undefined 为占位，数字按字符串判断', () => {
  assert.equal(isPlaceholderValue(null), true);
  assert.equal(isPlaceholderValue(undefined), true);
  assert.equal(isPlaceholderValue(18), false);
  assert.equal(isPlaceholderValue(0), false);
});

// ─── resolveActiveProfileFields（同义字段停用） ─────────────────────────────────────────────

test('非 character 类型返回全部字段；player 默认启用全部身份与外貌字段', () => {
  const world = insertWorld(sandbox.db);
  const locationFields = resolveActiveProfileFields(world.id, 'location');
  assert.deepEqual(locationFields, getProfileFieldDefinitions('location').map((f) => f.key));
  assert.deepEqual(resolveActiveProfileFields(world.id, 'player'), getProfileFieldDefinitions('player').map((f) => f.key));
});

test('世界里有同义的玩家字段时，玩家对应的档案字段停用', () => {
  const world = insertWorld(sandbox.db);
  insertPersonaStateField(sandbox.db, world.id, { field_key: 'outfit', label: '服装' });
  const active = resolveActiveProfileFields(world.id, 'player');
  assert.ok(!active.includes('outfit'));
  assert.ok(active.includes('gender'));
});

test('世界里存在 nearby_enabled=1 的同义角色字段时，对应档案字段停用', () => {
  const world = insertWorld(sandbox.db);
  insertCharacterStateField(sandbox.db, world.id, { field_key: 'occupation', label: '职业', nearby_enabled: 1 });
  sandbox.db.prepare('UPDATE character_state_fields SET nearby_enabled = 1 WHERE world_id = ?').run(world.id);

  const active = resolveActiveProfileFields(world.id, 'character');
  assert.ok(!active.includes('occupation'), 'occupation 应停用');
  assert.ok(active.includes('gender'), '未命中的字段应保持启用');
});

test('外貌同义命中时，外貌组整组停用', () => {
  const world = insertWorld(sandbox.db);
  insertCharacterStateField(sandbox.db, world.id, { field_key: 'appearance', label: '外貌' });
  sandbox.db.prepare('UPDATE character_state_fields SET nearby_enabled = 1 WHERE world_id = ?').run(world.id);

  const active = resolveActiveProfileFields(world.id, 'character');
  for (const key of ['height', 'build', 'hair', 'eyes', 'distinguishing_features']) {
    assert.ok(!active.includes(key), `${key} 应随外貌组停用`);
  }
  assert.ok(active.includes('outfit'), '穿着不属于外貌组同义词，不受影响');
});

test('nearby_enabled=0 的同义字段不触发停用', () => {
  const world = insertWorld(sandbox.db);
  insertCharacterStateField(sandbox.db, world.id, { field_key: 'occupation', label: '职业' });
  sandbox.db.prepare('UPDATE character_state_fields SET nearby_enabled = 0 WHERE world_id = ?').run(world.id);

  const active = resolveActiveProfileFields(world.id, 'character');
  assert.ok(active.includes('occupation'), 'nearby_enabled=0 时不应停用');
});

test('field_key 带 _char 后缀也能按去后缀后的值匹配同义词', () => {
  const world = insertWorld(sandbox.db);
  insertCharacterStateField(sandbox.db, world.id, { field_key: 'identity_char', label: '不相关标签' });
  sandbox.db.prepare('UPDATE character_state_fields SET nearby_enabled = 1 WHERE world_id = ?').run(world.id);

  const active = resolveActiveProfileFields(world.id, 'character');
  assert.ok(!active.includes('occupation'), 'identity_char 去后缀后应匹配 occupation 的同义词 identity');
});
