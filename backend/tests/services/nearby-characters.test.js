import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import {
  insertCharacter,
  insertCharacterStateField,
  insertCharacterStateValue,
  insertSession,
  insertWorld,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('service-nearby-characters');
sandbox.setEnv();

after(() => sandbox.cleanup());

function setNearbyEnabled(db, fieldId, enabled) {
  db.prepare('UPDATE character_state_fields SET nearby_enabled = ? WHERE id = ?')
    .run(enabled ? 1 : 0, fieldId);
}

function makeWorldAndSession(name) {
  const world = insertWorld(sandbox.db, { name: `${name}-世界` });
  const session = insertSession(sandbox.db, {
    world_id: world.id,
    character_id: null,
    mode: 'writing',
  });
  return { worldId: world.id, sessionId: session.id };
}

test('addSavedFromCharacter：仅复制 nearby_enabled=1 字段的 default 值；listNearby 返回 state 列表', async () => {
  const { worldId, sessionId } = makeWorldAndSession('add-saved');
  const moodField = insertCharacterStateField(sandbox.db, worldId, {
    field_key: 'mood', label: '心情', type: 'text', description: '当前心情',
  });
  const hpField = insertCharacterStateField(sandbox.db, worldId, {
    field_key: 'hp', label: 'HP', type: 'number',
  });
  setNearbyEnabled(sandbox.db, moodField.id, 1);
  setNearbyEnabled(sandbox.db, hpField.id, 0);

  const character = insertCharacter(sandbox.db, worldId, { name: '阿绪' });
  insertCharacterStateValue(sandbox.db, character.id, {
    field_key: 'mood', default_value_json: JSON.stringify('开心'),
  });
  insertCharacterStateValue(sandbox.db, character.id, {
    field_key: 'hp', default_value_json: JSON.stringify(80),
  });

  const { addSavedFromCharacter, listNearby } = await freshImport('backend/services/writing-sessions.js');

  const nearbyId = addSavedFromCharacter(sessionId, character.id);
  assert.ok(nearbyId);

  const list = listNearby(sessionId);
  assert.equal(list.length, 1);
  const row = list[0];
  assert.equal(row.id, nearbyId);
  assert.equal(row.session_id, sessionId);
  assert.equal(row.name, '阿绪');
  assert.equal(row.is_saved, 1);
  assert.equal(row.persona, '');
  assert.ok(Array.isArray(row.state));
  // 仅 nearby_enabled=1 的 mood 出现，hp 不应出现
  assert.equal(row.state.length, 1);
  const mood = row.state[0];
  assert.equal(mood.field_key, 'mood');
  assert.equal(mood.label, '心情');
  assert.equal(mood.type, 'text');
  assert.equal(mood.runtime_value_json, JSON.stringify('开心'));
});

test('addSavedFromCharacter：没有可复制的默认值时不写入 nearby 状态', async () => {
  const { worldId, sessionId } = makeWorldAndSession('add-saved-empty');
  const disabledField = insertCharacterStateField(sandbox.db, worldId, {
    field_key: 'disabled', label: '未启用', type: 'text',
  });
  const emptyField = insertCharacterStateField(sandbox.db, worldId, {
    field_key: 'empty', label: '空默认值', type: 'text',
  });
  setNearbyEnabled(sandbox.db, disabledField.id, 0);
  setNearbyEnabled(sandbox.db, emptyField.id, 1);

  const character = insertCharacter(sandbox.db, worldId, { name: '无状态角色' });
  insertCharacterStateValue(sandbox.db, character.id, {
    field_key: 'disabled', default_value_json: JSON.stringify('忽略'),
  });
  insertCharacterStateValue(sandbox.db, character.id, {
    field_key: 'empty', default_value_json: null,
  });

  const { addSavedFromCharacter, listNearby } = await freshImport('backend/services/writing-sessions.js');
  const nearbyId = addSavedFromCharacter(sessionId, character.id);

  assert.ok(nearbyId);
  assert.deepEqual(
    sandbox.db.prepare(
      'SELECT field_key FROM session_nearby_character_state_values WHERE nearby_id = ?',
    ).all(nearbyId),
    [],
  );
  assert.equal(listNearby(sessionId)[0].state[0].runtime_value_json, null);
});

test('addSavedFromCharacter：多个默认值通过一次批量写入并保留角色和字段语义', async () => {
  const { worldId, sessionId } = makeWorldAndSession('add-saved-many');
  const fields = ['mood', 'hp', 'place'].map((fieldKey) => {
    const field = insertCharacterStateField(sandbox.db, worldId, {
      field_key: fieldKey, label: fieldKey, type: 'text',
    });
    setNearbyEnabled(sandbox.db, field.id, 1);
    return field;
  });
  const disabledField = insertCharacterStateField(sandbox.db, worldId, {
    field_key: 'ignored', label: 'ignored', type: 'text',
  });
  setNearbyEnabled(sandbox.db, disabledField.id, 0);

  const character = insertCharacter(sandbox.db, worldId, { name: '多状态角色' });
  const defaults = new Map([
    ['mood', JSON.stringify('冷静')],
    ['hp', JSON.stringify(80)],
    ['place', JSON.stringify('书房')],
    ['ignored', JSON.stringify('忽略')],
  ]);
  for (const fieldKey of [...fields.map((field) => field.field_key), 'ignored']) {
    insertCharacterStateValue(sandbox.db, character.id, {
      field_key: fieldKey,
      default_value_json: defaults.get(fieldKey),
    });
  }

  const { addSavedFromCharacter, listNearby } = await freshImport('backend/services/writing-sessions.js');
  const nearbyId = addSavedFromCharacter(sessionId, character.id);

  assert.ok(nearbyId);
  const row = listNearby(sessionId)[0];
  assert.equal(row.id, nearbyId);
  assert.equal(row.session_id, sessionId);
  assert.equal(row.name, '多状态角色');
  assert.deepEqual(Object.fromEntries(
    row.state.map(({ field_key, runtime_value_json }) => [field_key, runtime_value_json]),
  ), {
    mood: JSON.stringify('冷静'),
    hp: JSON.stringify(80),
    place: JSON.stringify('书房'),
  });
});

test('addSavedFromCharacter：name 已被占用时抛 NEARBY_NAME_CONFLICT', async () => {
  const { worldId, sessionId } = makeWorldAndSession('conflict');
  const character = insertCharacter(sandbox.db, worldId, { name: '重名君' });

  const { addSavedFromCharacter } = await freshImport('backend/services/writing-sessions.js');
  addSavedFromCharacter(sessionId, character.id);

  const character2 = insertCharacter(sandbox.db, worldId, { name: '重名君', sort_order: 1 });
  assert.throws(
    () => addSavedFromCharacter(sessionId, character2.id),
    (err) => err.code === 'NEARBY_NAME_CONFLICT',
  );
});

test('addSavedFromCharacter：character 不属于同一 world 抛错', async () => {
  const { sessionId } = makeWorldAndSession('cross-world');
  const otherWorld = insertWorld(sandbox.db, { name: '别的世界' });
  const character = insertCharacter(sandbox.db, otherWorld.id, { name: '外人' });

  const { addSavedFromCharacter } = await freshImport('backend/services/writing-sessions.js');
  assert.throws(() => addSavedFromCharacter(sessionId, character.id));
});

test('removeNearby：直接 DELETE，state 由 CASCADE 同步删', async () => {
  const { worldId, sessionId } = makeWorldAndSession('remove');
  const f = insertCharacterStateField(sandbox.db, worldId, {
    field_key: 'mood', label: '心情', type: 'text',
  });
  setNearbyEnabled(sandbox.db, f.id, 1);
  const character = insertCharacter(sandbox.db, worldId, { name: '小红' });
  insertCharacterStateValue(sandbox.db, character.id, {
    field_key: 'mood', default_value_json: JSON.stringify('平静'),
  });

  const { addSavedFromCharacter, listNearby, removeNearby } = await freshImport('backend/services/writing-sessions.js');
  const id = addSavedFromCharacter(sessionId, character.id);
  assert.equal(listNearby(sessionId).length, 1);
  removeNearby(sessionId, id);
  assert.equal(listNearby(sessionId).length, 0);

  const remaining = sandbox.db.prepare(
    'SELECT COUNT(*) AS c FROM session_nearby_character_state_values WHERE nearby_id = ?',
  ).get(id);
  assert.equal(remaining.c, 0);
});

test('removeNearby：不属于该 session 抛错', async () => {
  const { worldId, sessionId } = makeWorldAndSession('remove-foreign');
  const character = insertCharacter(sandbox.db, worldId, { name: '小蓝' });
  const { addSavedFromCharacter, removeNearby } = await freshImport('backend/services/writing-sessions.js');
  const nearbyId = addSavedFromCharacter(sessionId, character.id);

  const otherSession = insertSession(sandbox.db, { world_id: worldId, mode: 'writing' });
  assert.throws(() => removeNearby(otherSession.id, nearbyId));
});

test('setNearbyIsSaved：transient → saved 切换', async () => {
  const { worldId, sessionId } = makeWorldAndSession('issaved');
  const character = insertCharacter(sandbox.db, worldId, { name: 'A' });

  const { addSavedFromCharacter, setNearbyIsSaved, listNearby } =
    await freshImport('backend/services/writing-sessions.js');
  const id = addSavedFromCharacter(sessionId, character.id);
  setNearbyIsSaved(sessionId, id, 0);
  assert.equal(listNearby(sessionId)[0].is_saved, 0);
  setNearbyIsSaved(sessionId, id, 1);
  assert.equal(listNearby(sessionId)[0].is_saved, 1);
});

test('patchNearbyPersona：null/undefined 存为空串', async () => {
  const { worldId, sessionId } = makeWorldAndSession('persona');
  const character = insertCharacter(sandbox.db, worldId, { name: 'A' });
  const { addSavedFromCharacter, patchNearbyPersona, listNearby } =
    await freshImport('backend/services/writing-sessions.js');

  const id = addSavedFromCharacter(sessionId, character.id);
  patchNearbyPersona(sessionId, id, '冷静的剑客');
  assert.equal(listNearby(sessionId)[0].persona, '冷静的剑客');
  patchNearbyPersona(sessionId, id, null);
  assert.equal(listNearby(sessionId)[0].persona, '');
});

test('renameNearby：正常改名 + 重名抛 NEARBY_NAME_CONFLICT + 同名 no-op 通过', async () => {
  const { worldId, sessionId } = makeWorldAndSession('rename');
  const a = insertCharacter(sandbox.db, worldId, { name: 'A' });
  const b = insertCharacter(sandbox.db, worldId, { name: 'B', sort_order: 1 });

  const { addSavedFromCharacter, renameNearby, listNearby } =
    await freshImport('backend/services/writing-sessions.js');
  const aId = addSavedFromCharacter(sessionId, a.id);
  const bId = addSavedFromCharacter(sessionId, b.id);

  // 同名 no-op
  renameNearby(sessionId, aId, 'A');
  assert.ok(listNearby(sessionId).find((r) => r.id === aId).name === 'A');

  // 改成新名
  renameNearby(sessionId, aId, 'A2');
  assert.equal(listNearby(sessionId).find((r) => r.id === aId).name, 'A2');

  // 改成已占名 → 冲突
  assert.throws(
    () => renameNearby(sessionId, aId, 'B'),
    (err) => err.code === 'NEARBY_NAME_CONFLICT',
  );

  // 空名抛错
  assert.throws(() => renameNearby(sessionId, bId, ''));
  assert.throws(() => renameNearby(sessionId, bId, '   '));
});

test('patchNearbyState：写入启用字段 OK；未启用字段抛错', async () => {
  const { worldId, sessionId } = makeWorldAndSession('patch-state');
  const moodField = insertCharacterStateField(sandbox.db, worldId, {
    field_key: 'mood', label: '心情', type: 'text',
  });
  const hpField = insertCharacterStateField(sandbox.db, worldId, {
    field_key: 'hp', label: 'HP', type: 'number',
  });
  setNearbyEnabled(sandbox.db, moodField.id, 1);
  setNearbyEnabled(sandbox.db, hpField.id, 0);

  const character = insertCharacter(sandbox.db, worldId, { name: '主角' });

  const { addSavedFromCharacter, patchNearbyState, listNearby } =
    await freshImport('backend/services/writing-sessions.js');
  const id = addSavedFromCharacter(sessionId, character.id);

  patchNearbyState(sessionId, id, 'mood', JSON.stringify('愤怒'));
  const row = listNearby(sessionId).find((r) => r.id === id);
  const mood = row.state.find((s) => s.field_key === 'mood');
  assert.equal(mood.runtime_value_json, JSON.stringify('愤怒'));

  // 未启用字段
  assert.throws(() => patchNearbyState(sessionId, id, 'hp', JSON.stringify(50)));
  // 不存在字段
  assert.throws(() => patchNearbyState(sessionId, id, 'unknown', '"x"'));
});
