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

test('restoreStateFromSnapshot 在 snapshot=null 时清空当前会话的三层状态', async () => {
  const world = insertWorld(sandbox.db, { name: '回滚世界-清空' });
  const character = insertCharacter(sandbox.db, world.id, { name: '丙' });
  const session = insertSession(sandbox.db, { character_id: character.id });

  insertSessionWorldStateValue(sandbox.db, session.id, world.id, { field_key: 'weather', runtime_value_json: '"雪"' });
  insertSessionPersonaStateValue(sandbox.db, session.id, world.id, { field_key: 'trust', runtime_value_json: '3' });
  insertSessionCharacterStateValue(sandbox.db, session.id, character.id, { field_key: 'hp', runtime_value_json: '20' });

  const { restoreStateFromSnapshot } = await freshImport('backend/memory/state-rollback.js');
  restoreStateFromSnapshot(session.id, world.id, [character.id], null);

  const counts = {
    world: sandbox.db.prepare('SELECT COUNT(*) AS c FROM session_world_state_values WHERE session_id = ?').get(session.id).c,
    persona: sandbox.db.prepare('SELECT COUNT(*) AS c FROM session_persona_state_values WHERE session_id = ?').get(session.id).c,
    character: sandbox.db.prepare('SELECT COUNT(*) AS c FROM session_character_state_values WHERE session_id = ?').get(session.id).c,
  };
  assert.deepEqual(counts, { world: 0, persona: 0, character: 0 });
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

test('restoreStateFromSnapshot 还原 snapshot.nearby 层（name/persona/is_saved/state）', async () => {
  const world = insertWorld(sandbox.db, { name: '回滚世界-nearby' });
  const character = insertCharacter(sandbox.db, world.id, { name: '己' });
  const session = insertSession(sandbox.db, { character_id: character.id });

  const { createNearbyCharacter, listNearbyBySessionId } = await freshImport('backend/db/queries/session-nearby-characters.js');
  const { upsertNearbyStateValue, getStateValuesByNearbyId } = await freshImport('backend/db/queries/session-nearby-character-state-values.js');

  // 预置一个旧 nearby（应被清空）
  const oldId = createNearbyCharacter({ sessionId: session.id, name: '旧人', persona: '旧人设', isSaved: 0 });
  upsertNearbyStateValue({ sessionId: session.id, nearbyId: oldId, fieldKey: 'mood', valueJson: '"焦虑"' });

  const { restoreStateFromSnapshot } = await freshImport('backend/memory/state-rollback.js');
  restoreStateFromSnapshot(session.id, world.id, [character.id], {
    world: {},
    persona: {},
    character: { [character.id]: {} },
    nearby: [
      {
        id: 'snapshot-id-ignored',
        name: '路人甲',
        persona: '街角小贩',
        is_saved: 0,
        state: { hp: '50', mood: '"警惕"' },
      },
      {
        id: 'snapshot-id-ignored-2',
        name: '路人乙',
        persona: '',
        is_saved: 1,
        state: {},
      },
    ],
  });

  const rows = listNearbyBySessionId(session.id);
  assert.equal(rows.length, 2);

  // listNearby 排序：is_saved DESC, created_at ASC → 先 路人乙(is_saved=1)，再 路人甲
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.ok(byName['路人甲'] && byName['路人乙']);
  assert.equal(byName['路人甲'].persona, '街角小贩');
  assert.equal(byName['路人甲'].is_saved, 0);
  assert.equal(byName['路人乙'].is_saved, 1);
  // 旧 id 不复用
  assert.notEqual(byName['路人甲'].id, 'snapshot-id-ignored');

  // state values 重建
  const state甲 = getStateValuesByNearbyId(byName['路人甲'].id);
  const state甲Map = Object.fromEntries(state甲.map((s) => [s.field_key, s.runtime_value_json]));
  assert.deepEqual(state甲Map, { hp: '50', mood: '"警惕"' });

  const state乙 = getStateValuesByNearbyId(byName['路人乙'].id);
  assert.equal(state乙.length, 0);

  // 旧 nearby 已删除（CASCADE 清掉旧 state value）
  const oldStateRows = sandbox.db.prepare(
    'SELECT COUNT(*) AS c FROM session_nearby_character_state_values WHERE nearby_id = ?',
  ).get(oldId).c;
  assert.equal(oldStateRows, 0);
});

test('restoreStateFromSnapshot 在 snapshot 缺 nearby 字段时清空 nearby（向下兼容）', async () => {
  const world = insertWorld(sandbox.db, { name: '回滚世界-nearby-legacy' });
  const character = insertCharacter(sandbox.db, world.id, { name: '庚' });
  const session = insertSession(sandbox.db, { character_id: character.id });

  const { createNearbyCharacter, listNearbyBySessionId } = await freshImport('backend/db/queries/session-nearby-characters.js');
  const { upsertNearbyStateValue } = await freshImport('backend/db/queries/session-nearby-character-state-values.js');

  const nid = createNearbyCharacter({ sessionId: session.id, name: '残留', persona: '', isSaved: 0 });
  upsertNearbyStateValue({ sessionId: session.id, nearbyId: nid, fieldKey: 'hp', valueJson: '1' });

  const { restoreStateFromSnapshot } = await freshImport('backend/memory/state-rollback.js');
  restoreStateFromSnapshot(session.id, world.id, [character.id], {
    world: {},
    persona: {},
    character: { [character.id]: {} },
    // 缺 nearby
  });

  assert.equal(listNearbyBySessionId(session.id).length, 0);
  const stateCount = sandbox.db.prepare(
    'SELECT COUNT(*) AS c FROM session_nearby_character_state_values WHERE session_id = ?',
  ).get(session.id).c;
  assert.equal(stateCount, 0);
});
