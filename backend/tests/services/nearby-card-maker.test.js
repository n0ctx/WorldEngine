import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import {
  insertCharacter,
  insertCharacterStateField,
  insertMessage,
  insertSession,
  insertWorld,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('service-nearby-card-maker');
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

test('analyzeNearbyForCard：返回 LLM 草稿（name 透传 + LLM 三字段）', async () => {
  const { worldId, sessionId } = makeWorldAndWritingSession('analyze');
  const moodField = insertCharacterStateField(sandbox.db, worldId, {
    field_key: 'mood', label: '心情', type: 'text',
  });
  setNearbyEnabled(sandbox.db, moodField.id, 1);

  const character = insertCharacter(sandbox.db, worldId, { name: '阿绪', description: '一个内敛的青年。' });

  const { addSavedFromCharacter, patchNearbyState } =
    await freshImport('backend/services/writing-sessions.js');
  const nearbyId = addSavedFromCharacter(sessionId, character.id);
  patchNearbyState(sessionId, nearbyId, 'mood', JSON.stringify('沉静'));

  // 写几条消息让 analyze 有上下文
  insertMessage(sandbox.db, sessionId, { role: 'user', content: '你好啊' });
  insertMessage(sandbox.db, sessionId, { role: 'assistant', content: '你好。' });

  // mock LLM 返回固定 JSON（不再包含 description；description 由 nearby.persona 决定）
  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    system_prompt: '阿绪性格沉静，言语克制，习惯先观察再开口。',
    first_message: '（轻轻点头）你好。',
  });

  const { analyzeNearbyForCard } =
    await freshImport('backend/services/nearby-card-maker.js');
  const draft = await analyzeNearbyForCard(sessionId, nearbyId);

  assert.equal(draft.name, '阿绪');
  assert.equal(draft.system_prompt, '阿绪性格沉静，言语克制，习惯先观察再开口。');
  // description 直接来自 nearby.persona（addSavedFromCharacter 时从 character.description 拷贝）
  assert.equal(draft.description, '一个内敛的青年。');
  assert.equal(draft.first_message, '（轻轻点头）你好。');
});

test('analyzeNearbyForCard：LLM 返回非法 JSON 抛错', async () => {
  const { worldId, sessionId } = makeWorldAndWritingSession('analyze-bad');
  const character = insertCharacter(sandbox.db, worldId, { name: '糟糕' });
  const { addSavedFromCharacter } =
    await freshImport('backend/services/writing-sessions.js');
  const nearbyId = addSavedFromCharacter(sessionId, character.id);

  process.env.MOCK_LLM_COMPLETE = '这不是 JSON 啊';

  const { analyzeNearbyForCard } =
    await freshImport('backend/services/nearby-card-maker.js');
  await assert.rejects(
    () => analyzeNearbyForCard(sessionId, nearbyId),
    /invalid JSON/i,
  );
});

test('createCharacterFromNearby：落库；仅 nearby_enabled=1 字段写 default_value_json；不写 runtime；不带 persona；不带 nearby id', async () => {
  const { worldId, sessionId } = makeWorldAndWritingSession('create');
  const moodField = insertCharacterStateField(sandbox.db, worldId, {
    field_key: 'mood', label: '心情', type: 'text',
  });
  const hpField = insertCharacterStateField(sandbox.db, worldId, {
    field_key: 'hp', label: 'HP', type: 'number',
  });
  setNearbyEnabled(sandbox.db, moodField.id, 1);
  setNearbyEnabled(sandbox.db, hpField.id, 0);

  const seedCharacter = insertCharacter(sandbox.db, worldId, { name: '种子' });
  const { addSavedFromCharacter, patchNearbyState, patchNearbyPersona } =
    await freshImport('backend/services/writing-sessions.js');
  const nearbyId = addSavedFromCharacter(sessionId, seedCharacter.id);

  // 给 nearby 设置当前值（启用 mood + 禁用 hp 直接绕过 service 写库，模拟旧值）
  patchNearbyState(sessionId, nearbyId, 'mood', JSON.stringify('愤怒'));
  // 直接写 hp（模拟历史脏数据），即便存在也不应被拷贝
  sandbox.db.prepare(
    `INSERT INTO session_nearby_character_state_values
     (id, session_id, nearby_id, field_key, runtime_value_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(crypto.randomUUID(), sessionId, nearbyId, 'hp', JSON.stringify(33), Date.now());
  patchNearbyPersona(sessionId, nearbyId, '私下人设占位');

  const { createCharacterFromNearby } =
    await freshImport('backend/services/nearby-card-maker.js');
  const newId = createCharacterFromNearby({
    worldId,
    sessionId,
    nearbyId,
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

  // 状态值：仅 mood，且只写 default_value_json
  const values = sandbox.db.prepare(
    'SELECT * FROM character_state_values WHERE character_id = ? ORDER BY field_key',
  ).all(newId);
  assert.equal(values.length, 1);
  assert.equal(values[0].field_key, 'mood');
  assert.equal(values[0].default_value_json, JSON.stringify('愤怒'));
  assert.equal(values[0].runtime_value_json, null);

  // persona 不应写到 character row 任何字段（createCharacterFromNearby 用调用方传入的入参）
  // 描述/系统提示词都应是入参原值
  assert.ok(!row.description.includes('私下人设占位'));
  assert.ok(!row.system_prompt.includes('私下人设占位'));
});

test('createCharacterFromNearby：name 缺失 / nearby 不属于 session / session 不属于 world 抛错', async () => {
  const { worldId, sessionId } = makeWorldAndWritingSession('errors');
  const character = insertCharacter(sandbox.db, worldId, { name: 'A' });
  const { addSavedFromCharacter } =
    await freshImport('backend/services/writing-sessions.js');
  const nearbyId = addSavedFromCharacter(sessionId, character.id);

  const { createCharacterFromNearby } =
    await freshImport('backend/services/nearby-card-maker.js');

  // name 缺失
  assert.throws(
    () => createCharacterFromNearby({ worldId, sessionId, nearbyId, name: '   ' }),
    /name is required/,
  );

  // nearby 不存在
  assert.throws(
    () => createCharacterFromNearby({
      worldId, sessionId, nearbyId: 'no-such-nearby', name: 'X',
    }),
    (err) => err.code === 'NEARBY_NOT_FOUND',
  );

  // session 不属于 world
  const otherWorld = insertWorld(sandbox.db, { name: '别的世界' });
  assert.throws(
    () => createCharacterFromNearby({
      worldId: otherWorld.id, sessionId, nearbyId, name: 'X',
    }),
    (err) => err.code === 'SESSION_WORLD_MISMATCH',
  );
});
