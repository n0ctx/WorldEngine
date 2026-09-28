import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import {
  insertCharacter,
  insertSession,
  insertSessionCharacterStateValue,
  insertSessionPersonaStateValue,
  insertSessionWorldStateValue,
  insertWorld,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('memory-state-rollback-suite');
sandbox.setEnv();

after(() => sandbox.cleanup());

function countStateStatementExecutions(db, action) {
  const tables = [
    'session_world_state_values',
    'session_persona_state_values',
    'session_character_state_values',
    'session_entity_state_values',
  ];
  let count = 0;
  const prepare = db.prepare;
  db.prepare = (sql) => {
    const statement = prepare(sql);
    if (tables.some((table) => sql.includes(table))) {
      for (const method of ['run', 'get', 'all']) {
        if (typeof statement[method] !== 'function') continue;
        const execute = statement[method];
        statement[method] = (...args) => {
          count++;
          return execute(...args);
        };
      }
    }
    return statement;
  };
  try {
    action();
  } finally {
    db.prepare = prepare;
  }
  return count;
}

test('captureStateSnapshot 只捕获非空 runtime 值，并按角色拆分', async () => {
  const world = insertWorld(sandbox.db, { name: '回滚世界-快照' });
  const characterA = insertCharacter(sandbox.db, world.id, { name: '甲' });
  const characterB = insertCharacter(sandbox.db, world.id, { name: '乙' });
  const session = insertSession(sandbox.db, { character_id: characterA.id });

  insertSessionWorldStateValue(sandbox.db, session.id, world.id, { field_key: 'weather', runtime_value_json: '"雨"' });
  insertSessionWorldStateValue(sandbox.db, session.id, world.id, { field_key: 'season', runtime_value_json: null });
  insertSessionPersonaStateValue(sandbox.db, session.id, world.id, { field_key: 'mood', runtime_value_json: '"紧张"' });
  insertSessionCharacterStateValue(sandbox.db, session.id, characterA.id, { field_key: 'hp', runtime_value_json: '88' });
  insertSessionCharacterStateValue(sandbox.db, session.id, characterB.id, { field_key: 'stance', runtime_value_json: '"防御"' });

  const { captureStateSnapshot } = await freshImport('backend/memory/state-rollback.js');
  const snapshot = captureStateSnapshot(session.id, world.id, [characterA.id, characterB.id]);

  assert.deepEqual(snapshot, {
    world: { weather: '"雨"' },
    persona: { mood: '"紧张"' },
    character: {
      [characterA.id]: { hp: '88' },
      [characterB.id]: { stance: '"防御"' },
    },
  });
});

test('restoreStateFromSnapshot 在 snapshot=null 时保留当前会话的三层状态与实体字段值', async () => {
  const world = insertWorld(sandbox.db, { name: '回滚世界-保留' });
  const character = insertCharacter(sandbox.db, world.id, { name: '丙' });
  const session = insertSession(sandbox.db, { character_id: character.id });

  insertSessionWorldStateValue(sandbox.db, session.id, world.id, { field_key: 'weather', runtime_value_json: '"雪"' });
  insertSessionPersonaStateValue(sandbox.db, session.id, world.id, { field_key: 'trust', runtime_value_json: '3' });
  insertSessionCharacterStateValue(sandbox.db, session.id, character.id, { field_key: 'hp', runtime_value_json: '20' });

  const { upsertEntity } = await freshImport('backend/db/queries/state-memory.js');
  const { upsertEntityStateValues, getEntityStateValues } = await freshImport('backend/db/queries/session-entity-state-values.js');
  const entityId = 'entity-manual';
  upsertEntity(session.id, { entityId, seq: 1, type: 'character', name: '用户手动加的人' }, 0);
  upsertEntityStateValues(session.id, [{ entityId, fieldKey: 'mood', runtimeValueJson: '"友好"' }]);

  const { restoreStateFromSnapshot } = await freshImport('backend/memory/state-rollback.js');
  restoreStateFromSnapshot(session.id, world.id, [character.id], null);

  // 三层 state 全部保留
  const counts = {
    world: sandbox.db.prepare('SELECT COUNT(*) AS c FROM session_world_state_values WHERE session_id = ?').get(session.id).c,
    persona: sandbox.db.prepare('SELECT COUNT(*) AS c FROM session_persona_state_values WHERE session_id = ?').get(session.id).c,
    character: sandbox.db.prepare('SELECT COUNT(*) AS c FROM session_character_state_values WHERE session_id = ?').get(session.id).c,
  };
  assert.deepEqual(counts, { world: 1, persona: 1, character: 1 });

  // 实体字段值也保留（首轮重生成场景：用户在首轮前手动配置的实体字段不能丢）
  const entityValues = getEntityStateValues(session.id, [entityId]);
  assert.deepEqual(entityValues[entityId], { mood: '"友好"' });
});

test('restoreStateFromSnapshot 会清空旧值并仅恢复快照中存在的字段', async () => {
  const world = insertWorld(sandbox.db, { name: '回滚世界-恢复' });
  const characterA = insertCharacter(sandbox.db, world.id, { name: '丁' });
  const characterB = insertCharacter(sandbox.db, world.id, { name: '戊' });
  const session = insertSession(sandbox.db, { character_id: characterA.id });

  insertSessionWorldStateValue(sandbox.db, session.id, world.id, { field_key: 'weather', runtime_value_json: '"雾"' });
  insertSessionPersonaStateValue(sandbox.db, session.id, world.id, { field_key: 'alert', runtime_value_json: 'true' });
  insertSessionCharacterStateValue(sandbox.db, session.id, characterA.id, { field_key: 'hp', runtime_value_json: '10' });
  insertSessionCharacterStateValue(sandbox.db, session.id, characterB.id, { field_key: 'shield', runtime_value_json: '1' });

  const { restoreStateFromSnapshot } = await freshImport('backend/memory/state-rollback.js');
  restoreStateFromSnapshot(session.id, world.id, [characterA.id, characterB.id], {
    world: { weather: '"晴"' },
    persona: {},
    character: {
      [characterA.id]: { hp: '99' },
    },
  });

  const worldRows = sandbox.db.prepare('SELECT field_key, runtime_value_json FROM session_world_state_values WHERE session_id = ?').all(session.id);
  const personaRows = sandbox.db.prepare('SELECT field_key, runtime_value_json FROM session_persona_state_values WHERE session_id = ?').all(session.id);
  const characterRows = sandbox.db.prepare(`
    SELECT character_id, field_key, runtime_value_json
    FROM session_character_state_values
    WHERE session_id = ?
    ORDER BY character_id ASC
  `).all(session.id);

  assert.deepEqual(worldRows, [{ field_key: 'weather', runtime_value_json: '"晴"' }]);
  assert.deepEqual(personaRows, []);
  assert.deepEqual(characterRows, [{
    character_id: characterA.id,
    field_key: 'hp',
    runtime_value_json: '99',
  }]);
});

test('restoreStateFromSnapshot 还原 snapshot.entityValues 层，且只写回仍存在于 state_entities 的实体', async () => {
  const world = insertWorld(sandbox.db, { name: '回滚世界-entity' });
  const character = insertCharacter(sandbox.db, world.id, { name: '己' });
  const session = insertSession(sandbox.db, { character_id: character.id });

  const { upsertEntity } = await freshImport('backend/db/queries/state-memory.js');
  const { upsertEntityStateValues, getEntityStateValues } = await freshImport('backend/db/queries/session-entity-state-values.js');

  // 预置一个旧值（应被清空）
  upsertEntity(session.id, { entityId: 'entity-kept', seq: 1, type: 'character', name: '路人甲' }, 1);
  upsertEntityStateValues(session.id, [{ entityId: 'entity-kept', fieldKey: 'mood', runtimeValueJson: '"焦虑"' }]);

  const { restoreStateFromSnapshot } = await freshImport('backend/memory/state-rollback.js');
  restoreStateFromSnapshot(session.id, world.id, [character.id], {
    world: {},
    persona: {},
    character: { [character.id]: {} },
    entityValues: {
      'entity-kept': { hp: '50', mood: '"警惕"' },
      'entity-gone': { hp: '1' }, // 已不在 state_entities 中，不应写回
    },
  });

  const keptValues = getEntityStateValues(session.id, ['entity-kept']);
  assert.deepEqual(keptValues['entity-kept'], { hp: '50', mood: '"警惕"' });

  const goneValues = sandbox.db.prepare(
    'SELECT COUNT(*) AS c FROM session_entity_state_values WHERE session_id = ? AND entity_id = ?',
  ).get(session.id, 'entity-gone').c;
  assert.equal(goneValues, 0);
});

test('restoreStateFromSnapshot 在 snapshot 缺 entityValues 字段时不动实体字段值（向下兼容旧快照）', async () => {
  const world = insertWorld(sandbox.db, { name: '回滚世界-legacy' });
  const character = insertCharacter(sandbox.db, world.id, { name: '庚' });
  const session = insertSession(sandbox.db, { character_id: character.id });

  const { upsertEntity } = await freshImport('backend/db/queries/state-memory.js');
  const { upsertEntityStateValues, getEntityStateValues } = await freshImport('backend/db/queries/session-entity-state-values.js');

  upsertEntity(session.id, { entityId: 'entity-legacy', seq: 1, type: 'character', name: '残留' }, 1);
  upsertEntityStateValues(session.id, [{ entityId: 'entity-legacy', fieldKey: 'hp', runtimeValueJson: '1' }]);

  const { restoreStateFromSnapshot } = await freshImport('backend/memory/state-rollback.js');
  assert.doesNotThrow(() => restoreStateFromSnapshot(session.id, world.id, [character.id], {
    world: {},
    persona: {},
    character: { [character.id]: {} },
    nearby: [{ name: '旧快照残留字段', state: {} }],
    // 缺 entityValues
  }));

  const values = getEntityStateValues(session.id, ['entity-legacy']);
  assert.deepEqual(values['entity-legacy'], { hp: '1' });
});

test('restoreStateFromSnapshot：状态数增加时按表批量执行，并在任一表失败时整体回滚', async () => {
  const world = insertWorld(sandbox.db, { name: '回滚世界-批量' });
  const character = insertCharacter(sandbox.db, world.id, { name: '批量角色' });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id });
  const { restoreStateFromSnapshot } = await freshImport('backend/memory/state-rollback.js');
  const { upsertEntity } = await freshImport('backend/db/queries/state-memory.js');
  const { default: db } = await freshImport('backend/db/index.js');

  const makeSnapshot = (size) => {
    const entityValues = {};
    for (let index = 0; index < size; index++) {
      const entityId = `batch-entity-${index}`;
      upsertEntity(session.id, { entityId, seq: index + 1, type: 'character', name: `批量实体${index}` }, 1);
      entityValues[entityId] = { hp: String(index), mood: JSON.stringify(`心情${index}`) };
    }
    return {
      world: Object.fromEntries(Array.from({ length: size }, (_, index) => [`world-${index}`, String(index)])),
      persona: Object.fromEntries(Array.from({ length: size }, (_, index) => [`persona-${index}`, String(index)])),
      character: {
        [character.id]: Object.fromEntries(Array.from({ length: size }, (_, index) => [`character-${index}`, String(index)])),
      },
      entityValues,
    };
  };

  const smallCount = countStateStatementExecutions(db, () =>
    restoreStateFromSnapshot(session.id, world.id, [character.id], makeSnapshot(1)));
  const largeCount = countStateStatementExecutions(db, () =>
    restoreStateFromSnapshot(session.id, world.id, [character.id], makeSnapshot(30)));
  assert.equal(smallCount, 8);
  assert.equal(largeCount, smallCount);
  assert.equal(sandbox.db.prepare('SELECT COUNT(*) AS c FROM session_world_state_values WHERE session_id = ?').get(session.id).c, 30);
  assert.equal(sandbox.db.prepare('SELECT COUNT(*) AS c FROM session_persona_state_values WHERE session_id = ?').get(session.id).c, 30);
  assert.equal(sandbox.db.prepare('SELECT COUNT(*) AS c FROM session_character_state_values WHERE session_id = ?').get(session.id).c, 30);
  assert.equal(sandbox.db.prepare('SELECT COUNT(*) AS c FROM session_entity_state_values WHERE session_id = ?').get(session.id).c, 60);

  const beforeWorld = sandbox.db.prepare(
    'SELECT field_key, runtime_value_json FROM session_world_state_values WHERE session_id = ? ORDER BY field_key',
  ).all(session.id);
  const beforePersona = sandbox.db.prepare(
    'SELECT field_key, runtime_value_json FROM session_persona_state_values WHERE session_id = ? ORDER BY field_key',
  ).all(session.id);
  assert.throws(() => restoreStateFromSnapshot(session.id, world.id, ['missing-character'], {
    world: { replacement: '1' },
    persona: { replacement: '2' },
    character: { 'missing-character': { hp: '3' } },
  }), /FOREIGN KEY constraint failed/);
  assert.deepEqual(sandbox.db.prepare(
    'SELECT field_key, runtime_value_json FROM session_world_state_values WHERE session_id = ? ORDER BY field_key',
  ).all(session.id), beforeWorld);
  assert.deepEqual(sandbox.db.prepare(
    'SELECT field_key, runtime_value_json FROM session_persona_state_values WHERE session_id = ? ORDER BY field_key',
  ).all(session.id), beforePersona);
});

test('setSessionStateBaselineIfAbsent 不可变：仅首次写入，后续调用不覆盖', async () => {
  const world = insertWorld(sandbox.db, { name: '基线世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '辛' });
  const session = insertSession(sandbox.db, { character_id: character.id });

  const { getSessionStateBaseline, setSessionStateBaselineIfAbsent } =
    await freshImport('backend/db/queries/sessions.js');

  assert.equal(getSessionStateBaseline(session.id), null);

  const first = setSessionStateBaselineIfAbsent(session.id, '{"world":{"a":1}}');
  assert.equal(first, true);
  assert.equal(getSessionStateBaseline(session.id), '{"world":{"a":1}}');

  // 第二次（污染态）不得覆盖
  const second = setSessionStateBaselineIfAbsent(session.id, '{"world":{"polluted":99}}');
  assert.equal(second, false);
  assert.equal(getSessionStateBaseline(session.id), '{"world":{"a":1}}');
});

test('captureFullSnapshot 三层状态之外还包含当前会话全部实体的字段值层', async () => {
  const world = insertWorld(sandbox.db, { name: '基线-entity世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '壬' });
  const session = insertSession(sandbox.db, { character_id: character.id, mode: 'writing' });

  insertSessionPersonaStateValue(sandbox.db, session.id, world.id, { field_key: 'mood', runtime_value_json: '"平静"' });

  const { upsertEntity } = await freshImport('backend/db/queries/state-memory.js');
  const { upsertEntityStateValues } = await freshImport('backend/db/queries/session-entity-state-values.js');
  const entityId = 'entity-npc-1';
  upsertEntity(session.id, { entityId, seq: 1, type: 'character', name: '路人甲' }, 1);
  upsertEntityStateValues(session.id, [
    { entityId, fieldKey: 'favor', runtimeValueJson: '5' },
    { entityId, fieldKey: 'stale', runtimeValueJson: null },
  ]);

  const { captureFullSnapshot } = await freshImport('backend/memory/state-rollback.js');
  const snap = captureFullSnapshot(session.id, world.id, []);

  assert.equal(snap.persona.mood, '"平静"');
  assert.deepEqual(snap.entityValues, { [entityId]: { favor: '5' } });
});
