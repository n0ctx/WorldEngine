import fs from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import {
  insertCharacter,
  insertDailyEntry,
  insertSession,
  insertWorld,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('service-worlds-suite', {
  diary: {
    chat: { enabled: true, date_mode: 'virtual' },
    writing: { enabled: false, date_mode: 'virtual' },
  },
});
sandbox.setEnv();

after(() => sandbox.cleanup());

test('ensureDiaryTimeField 会按配置创建、更新并删除 diary_time 字段', async () => {
  const world = insertWorld(sandbox.db, { name: '世界-日记字段' });
  const { ensureDiaryTimeField } = await freshImport('backend/services/worlds.js');

  ensureDiaryTimeField(world.id);
  let row = sandbox.db.prepare(`
    SELECT update_mode, update_instruction
    FROM world_state_fields
    WHERE world_id = ? AND field_key = 'diary_time'
  `).get(world.id);
  assert.equal(row.update_mode, 'llm_auto');
  assert.match(row.update_instruction, /YYYY-MM-DDTHH:mm/);

  sandbox.writeConfig({
    ...sandbox.readConfig(),
    diary: {
      chat: { enabled: true, date_mode: 'real' },
      writing: { enabled: false, date_mode: 'virtual' },
    },
  });
  ensureDiaryTimeField(world.id);
  row = sandbox.db.prepare(`
    SELECT update_mode, update_instruction
    FROM world_state_fields
    WHERE world_id = ? AND field_key = 'diary_time'
  `).get(world.id);
  assert.deepEqual(row, { update_mode: 'system_rule', update_instruction: '' });

  sandbox.writeConfig({
    ...sandbox.readConfig(),
    diary: {
      chat: { enabled: false, date_mode: 'virtual' },
      writing: { enabled: false, date_mode: 'virtual' },
    },
  });
  ensureDiaryTimeField(world.id);
  const count = sandbox.db.prepare(`
    SELECT COUNT(*) AS c FROM world_state_fields WHERE world_id = ? AND field_key = 'diary_time'
  `).get(world.id).c;
  assert.equal(count, 0);
});

test('createWorld 会同时创建 persona 记录', async () => {
  const { createWorld } = await freshImport('backend/services/worlds.js');
  const world = createWorld({
    name: '世界-新建',
    persona_name: '旅者',
    persona_system_prompt: '你是见证者',
  });

  const persona = sandbox.db.prepare(`
    SELECT name, system_prompt FROM personas WHERE world_id = ?
  `).get(world.id);
  assert.deepEqual(persona, { name: '旅者', system_prompt: '你是见证者' });
});

test('createWorld 会种下世界/玩家/角色三层默认状态字段并初始化状态值', async () => {
  const { createWorld } = await freshImport('backend/services/worlds.js');
  const world = createWorld({ name: '世界-默认字段' });

  const worldFields = sandbox.db.prepare(`
    SELECT field_key, label, type, update_mode, default_value, allow_empty, sort_order, update_instruction
    FROM world_state_fields WHERE world_id = ? AND field_key != 'diary_time'
    ORDER BY sort_order ASC
  `).all(world.id);
  assert.deepEqual(worldFields.map((f) => f.field_key), ['location', 'weather']);
  assert.equal(worldFields[0].sort_order, 1);
  assert.equal(worldFields[0].type, 'text');
  assert.equal(worldFields[0].update_mode, 'llm_auto');
  assert.equal(worldFields[0].allow_empty, 1);
  assert.equal(worldFields[1].type, 'enum');
  assert.equal(worldFields[1].default_value, '晴');

  const weatherEnumOptions = sandbox.db.prepare(`
    SELECT enum_options FROM world_state_fields WHERE world_id = ? AND field_key = 'weather'
  `).get(world.id);
  assert.deepEqual(JSON.parse(weatherEnumOptions.enum_options), ['晴', '多云', '阴', '雨', '雪', '雾', '风暴']);

  const personaFields = sandbox.db.prepare(`
    SELECT field_key, type, update_mode, min_value, sort_order FROM persona_state_fields
    WHERE world_id = ? ORDER BY sort_order ASC
  `).all(world.id);
  assert.deepEqual(personaFields.map((f) => f.field_key), ['personality', 'age', 'appearance', 'outfit', 'identity']);
  assert.equal(personaFields[1].type, 'number');
  assert.equal(personaFields[1].min_value, 0);
  assert.equal(personaFields[3].update_mode, 'llm_auto');

  const characterFields = sandbox.db.prepare(`
    SELECT field_key, type FROM character_state_fields WHERE world_id = ? ORDER BY sort_order ASC
  `).all(world.id);
  assert.deepEqual(characterFields.map((f) => f.field_key), ['personality', 'age', 'appearance', 'outfit', 'identity']);

  // 世界状态值：location/weather 已按默认值初始化
  const worldValues = sandbox.db.prepare(`
    SELECT field_key, default_value_json FROM world_state_values WHERE world_id = ? AND field_key IN ('location', 'weather')
    ORDER BY field_key ASC
  `).all(world.id);
  assert.deepEqual(worldValues, [
    { field_key: 'location', default_value_json: '' },
    { field_key: 'weather', default_value_json: '晴' },
  ]);

  // persona 状态值：personality（list）已按默认值 [] 初始化
  const persona = sandbox.db.prepare('SELECT id FROM personas WHERE world_id = ?').get(world.id);
  const personaValue = sandbox.db.prepare(`
    SELECT default_value_json FROM persona_state_values WHERE world_id = ? AND field_key = 'personality'
  `).get(world.id);
  assert.equal(personaValue.default_value_json, '[]');
  assert.ok(persona.id);
});

test('clearAllDiaryData 会删除所有聊天会话的日记记录与磁盘目录', async () => {
  const world = insertWorld(sandbox.db, { name: '世界-清理日记' });
  const character = insertCharacter(sandbox.db, world.id, { name: '砂舟' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertDailyEntry(sandbox.db, session.id, {
    date_str: '1000-01-02',
    date_display: '1000年1月2日',
    summary: '第二天',
  });

  const diaryDir = path.join(sandbox.root, 'daily', session.id);
  fs.mkdirSync(diaryDir, { recursive: true });
  fs.writeFileSync(path.join(diaryDir, '1000-01-02.md'), '# 第二天');

  const { clearAllDiaryData } = await freshImport('backend/services/worlds.js');
  clearAllDiaryData();

  const count = sandbox.db.prepare('SELECT COUNT(*) AS c FROM daily_entries WHERE session_id = ?').get(session.id).c;
  assert.equal(count, 0);
  assert.equal(fs.existsSync(diaryDir), false);
});
