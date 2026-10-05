import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import {
  insertCharacterStateField,
  insertMessage,
  insertSession,
  insertWorld,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('service-entity-card-maker');
sandbox.setEnv();

after(() => sandbox.cleanup());

beforeEach(() => {
  resetMockEnv();
});

function setNearbyEnabled(db, fieldId, enabled) {
  db.prepare('UPDATE character_state_fields SET nearby_enabled = ? WHERE id = ?')
    .run(enabled ? 1 : 0, fieldId);
}

function makeWorldAndWritingSession(name) {
  const world = insertWorld(sandbox.db, { name: `${name}-世界` });
  // writing session 直接存进 sessions 表（mode='writing'）
  const session = insertSession(sandbox.db, {
    world_id: world.id,
    character_id: null,
    mode: 'writing',
  });
  return { worldId: world.id, sessionId: session.id };
}

async function makeCharacterEntity(sessionId, name) {
  const { createEntity } = await freshImport('backend/services/state-memory.js');
  return createEntity(sessionId, { type: 'character', name });
}

test('analyzeEntityForCard：返回 LLM 草稿（name 透传 + LLM 两字段 + description 来自档案文本）', async () => {
  const { worldId, sessionId } = makeWorldAndWritingSession('analyze');
  const moodField = insertCharacterStateField(sandbox.db, worldId, {
    field_key: 'mood', label: '心情', type: 'text',
  });
  setNearbyEnabled(sandbox.db, moodField.id, 1);

  const entity = await makeCharacterEntity(sessionId, '阿绪');
  const { updateEntity, updateEntityField } = await freshImport('backend/services/state-memory.js');
  updateEntity(sessionId, entity.entity_id, { profile: { background: ['一个内敛的青年'] } });
  updateEntityField(sessionId, entity.entity_id, 'mood', { value: '沉静' });

  // 写几条消息让 analyze 有上下文
  insertMessage(sandbox.db, sessionId, { role: 'user', content: '你好啊' });
  insertMessage(sandbox.db, sessionId, { role: 'assistant', content: '你好。' });

  // mock LLM 返回固定 JSON（不含 description；description 由档案文本决定）
  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    system_prompt: '阿绪性格沉静，言语克制，习惯先观察再开口。',
    first_message: '（轻轻点头）你好。',
  });

  const { renderEntityProfileText } = await freshImport('backend/memory/state-memory-render.js');
  const expectedDescription = renderEntityProfileText(sessionId, entity.entity_id, { worldId });
  assert.ok(expectedDescription);

  const { analyzeEntityForCard } = await freshImport('backend/services/entity-card-maker.js');
  const draft = await analyzeEntityForCard(sessionId, entity.entity_id);

  assert.equal(draft.name, '阿绪');
  assert.equal(draft.system_prompt, '阿绪性格沉静，言语克制，习惯先观察再开口。');
  assert.equal(draft.description, expectedDescription);
  assert.equal(draft.first_message, '（轻轻点头）你好。');
});

test('analyzeEntityForCard：LLM 返回非法 JSON 抛错', async () => {
  const { sessionId } = makeWorldAndWritingSession('analyze-bad');
  const entity = await makeCharacterEntity(sessionId, '糟糕');

  process.env.MOCK_LLM_COMPLETE = '这不是 JSON 啊';

  const { analyzeEntityForCard } = await freshImport('backend/services/entity-card-maker.js');
  await assert.rejects(
    () => analyzeEntityForCard(sessionId, entity.entity_id),
    /invalid JSON/i,
  );
});

test('createCharacterFromEntity：落库；仅 nearby_enabled=1 字段写 default_value_json；档案存成档案初始值；不写 runtime；回写实体 card_id', async () => {
  const { worldId, sessionId } = makeWorldAndWritingSession('create');
  const moodField = insertCharacterStateField(sandbox.db, worldId, {
    field_key: 'mood', label: '心情', type: 'text',
  });
  const hpField = insertCharacterStateField(sandbox.db, worldId, {
    field_key: 'hp', label: 'HP', type: 'number',
  });
  setNearbyEnabled(sandbox.db, moodField.id, 1);
  setNearbyEnabled(sandbox.db, hpField.id, 0);

  const entity = await makeCharacterEntity(sessionId, '种子');
  const { updateEntityField } = await freshImport('backend/services/state-memory.js');
  updateEntityField(sessionId, entity.entity_id, 'mood', { value: '愤怒' });
  // 直接写 hp（模拟禁用字段的历史脏数据），即便存在也不应被拷贝
  sandbox.db.prepare(
    `INSERT INTO session_entity_state_values (id, session_id, entity_id, field_key, runtime_value_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(crypto.randomUUID(), sessionId, entity.entity_id, 'hp', JSON.stringify(33), Date.now());
  const { updateEntity } = await freshImport('backend/services/state-memory.js');
  updateEntity(sessionId, entity.entity_id, { profile: { gender: '男', core_traits: ['暴躁'] } });

  const { createCharacterFromEntity } = await freshImport('backend/services/entity-card-maker.js');
  const newId = createCharacterFromEntity({
    worldId,
    sessionId,
    entityId: entity.entity_id,
    name: '阿绪',
    system_prompt: 'sp',
    description: 'desc',
    first_message: 'fm',
  });

  // characters 表
  const row = sandbox.db.prepare('SELECT * FROM characters WHERE id = ?').get(newId);
  assert.ok(row);
  assert.equal(row.world_id, worldId);
  assert.equal(row.name, '阿绪');
  assert.equal(row.system_prompt, 'sp');
  assert.equal(row.description, 'desc');
  assert.equal(row.first_message, 'fm');
  assert.equal(row.post_prompt, '');
  assert.equal(row.avatar_path, null);
  assert.deepEqual(JSON.parse(row.profile_defaults_json), { gender: '男', core_traits: ['暴躁'] });

  // 状态值：仅 mood，且只写 default_value_json
  const values = sandbox.db.prepare(
    'SELECT * FROM character_state_values WHERE character_id = ? ORDER BY field_key',
  ).all(newId);
  assert.equal(values.length, 1);
  assert.equal(values[0].field_key, 'mood');
  assert.equal(values[0].default_value_json, JSON.stringify('愤怒'));
  assert.equal(values[0].runtime_value_json, null);

  // 实体的 card_id 回写为新角色卡
  const entityRow = sandbox.db.prepare(
    'SELECT card_id FROM state_entities WHERE session_id = ? AND entity_id = ? AND valid_to_round IS NULL',
  ).get(sessionId, entity.entity_id);
  assert.equal(entityRow.card_id, newId);
});

test('createCharacterFromEntity：批量复制大量启用字段的当前值', async () => {
  const { worldId, sessionId } = makeWorldAndWritingSession('create-many-state-values');
  const stateCount = 180;
  const fieldKeys = [];
  for (let index = 0; index < stateCount; index += 1) {
    const fieldKey = `entity_state_${index}`;
    const field = insertCharacterStateField(sandbox.db, worldId, {
      field_key: fieldKey,
      label: `状态 ${index}`,
      type: 'text',
      default_value: `default-${index}`,
    });
    setNearbyEnabled(sandbox.db, field.id, 1);
    fieldKeys.push(fieldKey);
  }

  const entity = await makeCharacterEntity(sessionId, '多状态种子');
  const { updateEntityField } = await freshImport('backend/services/state-memory.js');
  for (let index = 0; index < fieldKeys.length; index += 1) {
    updateEntityField(sessionId, entity.entity_id, fieldKeys[index], { value: `current-${index}` });
  }

  const { createCharacterFromEntity } = await freshImport('backend/services/entity-card-maker.js');
  const characterId = createCharacterFromEntity({
    worldId,
    sessionId,
    entityId: entity.entity_id,
    name: '多状态新角色',
  });
  const values = sandbox.db.prepare(`
    SELECT field_key, default_value_json, runtime_value_json
    FROM character_state_values
    WHERE character_id = ?
    ORDER BY field_key
  `).all(characterId);

  assert.equal(values.length, stateCount);
  assert.deepEqual(values[0], {
    field_key: fieldKeys[0],
    default_value_json: JSON.stringify('current-0'),
    runtime_value_json: null,
  });
  assert.deepEqual(values.find((value) => value.field_key === fieldKeys[stateCount - 1]), {
    field_key: fieldKeys[stateCount - 1],
    default_value_json: JSON.stringify(`current-${stateCount - 1}`),
    runtime_value_json: null,
  });
});

test('createCharacterFromEntity：name 缺失 / 实体不属于 session / session 不属于 world 抛错', async () => {
  const { worldId, sessionId } = makeWorldAndWritingSession('errors');
  const entity = await makeCharacterEntity(sessionId, 'A');

  const { createCharacterFromEntity } = await freshImport('backend/services/entity-card-maker.js');

  // name 缺失
  assert.throws(
    () => createCharacterFromEntity({ worldId, sessionId, entityId: entity.entity_id, name: '   ' }),
    /name is required/,
  );

  // 实体不存在
  assert.throws(
    () => createCharacterFromEntity({
      worldId, sessionId, entityId: 'no-such-entity', name: 'X',
    }),
    (err) => err.code === 'ENTITY_NOT_FOUND',
  );

  // session 不属于 world
  const otherWorld = insertWorld(sandbox.db, { name: '别的世界' });
  assert.throws(
    () => createCharacterFromEntity({
      worldId: otherWorld.id, sessionId, entityId: entity.entity_id, name: 'X',
    }),
    (err) => err.code === 'SESSION_WORLD_MISMATCH',
  );
});

test('createPersonaFromEntity：落库玩家卡；只把玩家卡可预设的档案（身份、外貌）存成档案初始值；不回写实体 card_id', async () => {
  const { worldId, sessionId } = makeWorldAndWritingSession('create-persona');
  const entity = await makeCharacterEntity(sessionId, '种子');
  const { updateEntity } = await freshImport('backend/services/state-memory.js');
  updateEntity(sessionId, entity.entity_id, { profile: { gender: '女', hair: '短发', core_traits: ['暴躁'] } });

  const { createPersonaFromEntity } = await freshImport('backend/services/entity-card-maker.js');
  const newId = createPersonaFromEntity({
    worldId,
    sessionId,
    entityId: entity.entity_id,
    name: '  阿绪  ',
    system_prompt: 'sp',
    description: 'desc',
  });

  const row = sandbox.db.prepare('SELECT * FROM personas WHERE id = ?').get(newId);
  assert.equal(row.world_id, worldId);
  assert.equal(row.name, '阿绪');
  assert.equal(row.system_prompt, 'sp');
  assert.equal(row.description, 'desc');
  assert.deepEqual(JSON.parse(row.profile_defaults_json), { gender: '女', hair: '短发' });

  const entityRow = sandbox.db.prepare(
    'SELECT card_id FROM state_entities WHERE session_id = ? AND entity_id = ? AND valid_to_round IS NULL',
  ).get(sessionId, entity.entity_id);
  assert.equal(entityRow.card_id, null);

  assert.throws(
    () => createPersonaFromEntity({ worldId, sessionId, entityId: entity.entity_id, name: '  ' }),
    /name is required/,
  );
});
