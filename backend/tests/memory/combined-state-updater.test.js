import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import {
  insertCharacter,
  insertCharacterStateField,
  insertMessage,
  insertPersonaStateField,
  insertSession,
  insertWorld,
  insertWorldStateField,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('state-suite');
sandbox.setEnv();
after(() => {
  resetMockEnv();
  sandbox.cleanup();
});

test('filterActive 仅返回符合 trigger_mode 的自动字段', async () => {
  const { __testables } = await freshImport('backend/memory/combined-state-updater.js');
  const fields = [
    { field_key: 'manual', update_mode: 'manual', trigger_mode: 'every_turn' },
    { field_key: 'blocked', update_mode: 'llm_auto', trigger_mode: 'manual_only' },
    { field_key: 'always', update_mode: 'llm_auto', trigger_mode: 'every_turn' },
    { field_key: 'kw', update_mode: 'llm_auto', trigger_mode: 'keyword_based', trigger_keywords: ['伤口'] },
  ];
  const active = __testables.filterActive(fields, '处理伤口');
  assert.deepEqual(active.map((item) => item.field_key), ['always', 'kw']);
});

test('validateValue 覆盖 text/number/boolean/enum/list', async () => {
  const { __testables } = await freshImport('backend/memory/combined-state-updater.js');
  assert.equal(__testables.validateValue('文本', { type: 'text', allow_empty: 1 }), '文本');
  assert.equal(__testables.validateValue('12', { type: 'number', min_value: 1, max_value: 20, allow_empty: 1 }), 12);
  assert.equal(__testables.validateValue('false', { type: 'boolean', allow_empty: 1 }), false);
  assert.equal(__testables.validateValue('happy', { type: 'enum', enum_options: ['happy'], allow_empty: 1 }), 'happy');
  assert.deepEqual(__testables.validateValue('剑,盾', { type: 'list', allow_empty: 1 }), ['剑', '盾']);
  assert.equal(__testables.validateValue('', { type: 'text', allow_empty: 0 }), undefined);
});

test('updateAllStates 在 LLM 失败时不写入任何会话状态', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '阿尔卡' });
  const character = insertCharacter(sandbox.db, world.id, { name: '诺亚' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '我受伤了', created_at: 1 });
  insertWorldStateField(sandbox.db, world.id, { field_key: 'weather', label: '天气', update_mode: 'llm_auto', trigger_mode: 'every_turn' });
  insertCharacterStateField(sandbox.db, world.id, { field_key: 'hp', label: '生命', type: 'number', update_mode: 'llm_auto', trigger_mode: 'keyword_based', trigger_keywords: ['受伤'] });
  insertPersonaStateField(sandbox.db, world.id, { field_key: 'pain', label: '疼痛', update_mode: 'llm_auto', trigger_mode: 'every_turn' });
  process.env.MOCK_LLM_COMPLETE_ERROR = 'state fail';

  const { updateAllStates } = await freshImport('backend/memory/combined-state-updater.js');
  await assert.rejects(updateAllStates(world.id, [character.id], session.id), /state fail/);

  const worldRows = sandbox.db.prepare('SELECT COUNT(*) AS c FROM session_world_state_values').get();
  const charRows = sandbox.db.prepare('SELECT COUNT(*) AS c FROM session_character_state_values').get();
  const personaRows = sandbox.db.prepare('SELECT COUNT(*) AS c FROM session_persona_state_values').get();
  assert.equal(worldRows.c, 0);
  assert.equal(charRows.c, 0);
  assert.equal(personaRows.c, 0);
});

test('updateAllStates 解析 patch 后写入世界/角色/玩家状态', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '阿尔卡' });
  const character = insertCharacter(sandbox.db, world.id, { name: '诺亚' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '我受伤了，天气转晴。', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '你包扎了伤口。', created_at: 2 });
  insertWorldStateField(sandbox.db, world.id, { field_key: 'weather', label: '天气', update_mode: 'llm_auto', trigger_mode: 'every_turn' });
  insertCharacterStateField(sandbox.db, world.id, { field_key: 'hp', label: '生命', type: 'number', update_mode: 'llm_auto', trigger_mode: 'every_turn' });
  insertPersonaStateField(sandbox.db, world.id, { field_key: 'pain', label: '疼痛', update_mode: 'llm_auto', trigger_mode: 'every_turn' });
  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    world: { weather: '晴朗' },
    char_0: { hp: 88 },
    persona: { pain: '减轻' },
  });

  const { updateAllStates } = await freshImport('backend/memory/combined-state-updater.js');
  await updateAllStates(world.id, [character.id], session.id);

  const worldValue = sandbox.db.prepare('SELECT runtime_value_json FROM session_world_state_values WHERE session_id = ? AND field_key = ?').get(session.id, 'weather');
  const charValue = sandbox.db.prepare('SELECT runtime_value_json FROM session_character_state_values WHERE session_id = ? AND field_key = ?').get(session.id, 'hp');
  const personaValue = sandbox.db.prepare('SELECT runtime_value_json FROM session_persona_state_values WHERE session_id = ? AND field_key = ?').get(session.id, 'pain');
  assert.equal(worldValue?.runtime_value_json, '"晴朗"');
  assert.equal(charValue?.runtime_value_json, '88');
  assert.equal(personaValue?.runtime_value_json, '"减轻"');
});
