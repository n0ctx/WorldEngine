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
