import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import {
  insertCharacterStateField,
  insertSession,
  insertWorld,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('cs-updater-nearby');
sandbox.setEnv();
after(() => sandbox.cleanup());

function setNearbyEnabled(db, fieldId, enabled) {
  db.prepare('UPDATE character_state_fields SET nearby_enabled = ? WHERE id = ?')
    .run(enabled ? 1 : 0, fieldId);
}

function makeWorldSession(name) {
  const world = insertWorld(sandbox.db, { name: `${name}-世界` });
  const session = insertSession(sandbox.db, {
    world_id: world.id,
    mode: 'writing',
  });
  return { worldId: world.id, sessionId: session.id };
}

function insertNearby(db, { sessionId, name, memory = '', isSaved = 0 }) {
  const id = `nb-${Math.random().toString(36).slice(2, 10)}`;
  const now = Date.now();
  db.prepare(`
    INSERT INTO session_nearby_characters (id, session_id, name, memory, is_saved, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, sessionId, name, memory, isSaved ? 1 : 0, now, now);
  return id;
}

function setNearbyState(db, { sessionId, nearbyId, fieldKey, valueJson }) {
  const id = `sv-${Math.random().toString(36).slice(2, 10)}`;
  db.prepare(`
    INSERT INTO session_nearby_character_state_values
      (id, session_id, nearby_id, field_key, runtime_value_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, sessionId, nearbyId, fieldKey, valueJson, Date.now());
}

function listAllNearby(db, sessionId) {
  return db.prepare(
    `SELECT * FROM session_nearby_characters WHERE session_id = ? ORDER BY created_at ASC`,
  ).all(sessionId);
}

function listAllStateValues(db, nearbyId) {
  return db.prepare(
    `SELECT field_key, runtime_value_json FROM session_nearby_character_state_values WHERE nearby_id = ? ORDER BY field_key`,
  ).all(nearbyId);
}

function bootstrap(name) {
  const ctx = makeWorldSession(name);
  const moodField = insertCharacterStateField(sandbox.db, ctx.worldId, {
    field_key: 'mood', label: '心情', type: 'text',
  });
  const hpField = insertCharacterStateField(sandbox.db, ctx.worldId, {
    field_key: 'hp', label: 'HP', type: 'number', min_value: 0, max_value: 100,
  });
  setNearbyEnabled(sandbox.db, moodField.id, 1);
  setNearbyEnabled(sandbox.db, hpField.id, 1);
  const fields = [
    { field_key: 'mood', label: '心情', type: 'text', allow_empty: 1 },
    { field_key: 'hp', label: 'HP', type: 'number', min_value: 0, max_value: 100, allow_empty: 1 },
  ];
  return { ...ctx, fields };
}

test('applyNearbyResult: ref_id 命中 → 更新 name/memory/state', async () => {
  const { sessionId, fields } = bootstrap('case1');
  const id = insertNearby(sandbox.db, { sessionId, name: 'Alice', memory: '旧记忆', isSaved: 0 });
  setNearbyState(sandbox.db, { sessionId, nearbyId: id, fieldKey: 'mood', valueJson: JSON.stringify('平静') });

  const { applyNearbyResult } = await freshImport('backend/memory/combined-state-updater.js');
  applyNearbyResult({
    sessionId,
    worldId: null,
    fields,
    nearby_characters: [
      { ref_id: id, name: 'Alice2', memory: '新记忆', state: { mood: '兴奋', hp: 75 } },
    ],
    pool: [{ id, name: 'Alice', is_saved: 0 }],
  });

  const rows = listAllNearby(sandbox.db, sessionId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Alice2');
  assert.equal(rows[0].memory, '新记忆');
  const states = listAllStateValues(sandbox.db, id);
  const mood = states.find((s) => s.field_key === 'mood');
  const hp = states.find((s) => s.field_key === 'hp');
  assert.equal(mood.runtime_value_json, JSON.stringify('兴奋'));
  assert.equal(hp.runtime_value_json, JSON.stringify(75));
});

test('applyNearbyResult: ref_id=null + name 命中 → 等同更新', async () => {
  const { sessionId, fields } = bootstrap('case2');
  const id = insertNearby(sandbox.db, { sessionId, name: 'Bob', memory: '', isSaved: 1 });

  const { applyNearbyResult } = await freshImport('backend/memory/combined-state-updater.js');
  applyNearbyResult({
    sessionId,
    worldId: null,
    fields,
    nearby_characters: [
      { ref_id: null, name: 'Bob', memory: '更新后的记忆', state: { mood: '冷静' } },
    ],
    pool: [{ id, name: 'Bob', is_saved: 1 }],
  });

  const rows = listAllNearby(sandbox.db, sessionId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, id);
  assert.equal(rows[0].memory, '更新后的记忆');
  const states = listAllStateValues(sandbox.db, id);
  assert.equal(states.find((s) => s.field_key === 'mood').runtime_value_json, JSON.stringify('冷静'));
});

test('applyNearbyResult: ref_id=null + name 不在池 → 新建 transient', async () => {
  const { sessionId, fields } = bootstrap('case3');

  const { applyNearbyResult } = await freshImport('backend/memory/combined-state-updater.js');
  applyNearbyResult({
    sessionId,
    worldId: null,
    fields,
    nearby_characters: [
      { ref_id: null, name: 'Carol', memory: '初次登场', state: { mood: '紧张', hp: 60 } },
    ],
    pool: [],
  });

  const rows = listAllNearby(sandbox.db, sessionId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Carol');
  assert.equal(rows[0].is_saved, 0);
  assert.equal(rows[0].memory, '初次登场');
  const states = listAllStateValues(sandbox.db, rows[0].id);
  assert.equal(states.find((s) => s.field_key === 'mood').runtime_value_json, JSON.stringify('紧张'));
  assert.equal(states.find((s) => s.field_key === 'hp').runtime_value_json, JSON.stringify(60));
});

test('applyNearbyResult: 非法 ref_id 整条丢弃；不影响其他项；不影响 saved', async () => {
  const { sessionId, fields } = bootstrap('case4');
  const savedId = insertNearby(sandbox.db, { sessionId, name: 'Saved', memory: '保留', isSaved: 1 });
  setNearbyState(sandbox.db, { sessionId, nearbyId: savedId, fieldKey: 'mood', valueJson: JSON.stringify('原状') });

  const { applyNearbyResult } = await freshImport('backend/memory/combined-state-updater.js');
  applyNearbyResult({
    sessionId,
    worldId: null,
    fields,
    nearby_characters: [
      { ref_id: 'bogus-id-not-in-pool', name: '幻影', state: { mood: '错误' } },
      { ref_id: null, name: 'Dora', memory: '正常项', state: { mood: '微笑' } },
    ],
    pool: [{ id: savedId, name: 'Saved', is_saved: 1 }],
  });

  const rows = listAllNearby(sandbox.db, sessionId);
  // saved 保留 + Dora 新建；不应有"幻影"
  const names = rows.map((r) => r.name).sort();
  assert.deepEqual(names, ['Dora', 'Saved']);
  const dora = rows.find((r) => r.name === 'Dora');
  assert.equal(dora.is_saved, 0);
  // saved 行原 state 不变（这次没回它）
  const savedState = listAllStateValues(sandbox.db, savedId);
  assert.equal(savedState.find((s) => s.field_key === 'mood').runtime_value_json, JSON.stringify('原状'));
});

test('applyNearbyResult: 池里没回的 transient 删除，saved 保留', async () => {
  const { sessionId, fields } = bootstrap('case5');
  const savedId = insertNearby(sandbox.db, { sessionId, name: 'Keep', memory: '保留 saved', isSaved: 1 });
  const transientId = insertNearby(sandbox.db, { sessionId, name: 'Drop', memory: '上轮 transient', isSaved: 0 });
  setNearbyState(sandbox.db, { sessionId, nearbyId: transientId, fieldKey: 'mood', valueJson: JSON.stringify('旧') });

  const { applyNearbyResult } = await freshImport('backend/memory/combined-state-updater.js');
  applyNearbyResult({
    sessionId,
    worldId: null,
    fields,
    // LLM 这一轮没提到任何角色
    nearby_characters: [],
    pool: [
      { id: savedId, name: 'Keep', is_saved: 1 },
      { id: transientId, name: 'Drop', is_saved: 0 },
    ],
  });

  const rows = listAllNearby(sandbox.db, sessionId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, savedId);
  // saved 的 state/memory 不变
  assert.equal(rows[0].memory, '保留 saved');

  // CASCADE 应清掉 transient 的 state values
  const orphan = sandbox.db
    .prepare('SELECT COUNT(*) AS c FROM session_nearby_character_state_values WHERE nearby_id = ?')
    .get(transientId);
  assert.equal(orphan.c, 0);
});

test('applyNearbyResult: 未启用字段被 LLM 写入 → 跳过', async () => {
  const { sessionId, worldId } = makeWorldSession('case6');
  // mood 启用，secret 不启用
  const moodField = insertCharacterStateField(sandbox.db, worldId, {
    field_key: 'mood', label: '心情', type: 'text',
  });
  const secretField = insertCharacterStateField(sandbox.db, worldId, {
    field_key: 'secret', label: '秘密', type: 'text',
  });
  setNearbyEnabled(sandbox.db, moodField.id, 1);
  setNearbyEnabled(sandbox.db, secretField.id, 0);
  const enabledOnly = [
    { field_key: 'mood', label: '心情', type: 'text', allow_empty: 1 },
  ];

  const id = insertNearby(sandbox.db, { sessionId, name: 'Eve', memory: '', isSaved: 0 });

  const { applyNearbyResult } = await freshImport('backend/memory/combined-state-updater.js');
  applyNearbyResult({
    sessionId,
    worldId,
    fields: enabledOnly,
    nearby_characters: [
      { ref_id: id, name: 'Eve', memory: 'm', state: { mood: '惊讶', secret: '不该写' } },
    ],
    pool: [{ id, name: 'Eve', is_saved: 0 }],
  });

  const states = listAllStateValues(sandbox.db, id);
  const keys = states.map((s) => s.field_key).sort();
  assert.deepEqual(keys, ['mood']);
  assert.equal(states[0].runtime_value_json, JSON.stringify('惊讶'));
});
