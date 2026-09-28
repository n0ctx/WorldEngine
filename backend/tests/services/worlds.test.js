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

test('createWorld 只种世界层默认状态字段并初始化状态值；玩家层/角色层不预设字段', async () => {
  const { createWorld } = await freshImport('backend/services/worlds.js');
  const world = createWorld({ name: '世界-默认字段' });

  const worldFields = sandbox.db.prepare(`
    SELECT field_key, label, type, update_mode, default_value, allow_empty, sort_order, update_instruction
    FROM world_state_fields WHERE world_id = ?
    ORDER BY sort_order ASC
  `).all(world.id);
  assert.deepEqual(worldFields.map((f) => f.field_key), ['weather']);
  assert.equal(worldFields[0].sort_order, 0);
  assert.equal(worldFields[0].type, 'enum');
  assert.equal(worldFields[0].default_value, '晴');

  const weatherEnumOptions = sandbox.db.prepare(`
    SELECT enum_options FROM world_state_fields WHERE world_id = ? AND field_key = 'weather'
  `).get(world.id);
  assert.deepEqual(JSON.parse(weatherEnumOptions.enum_options), ['晴', '多云', '阴', '雨', '雪', '雾', '风暴']);

  const personaFieldCount = sandbox.db.prepare(
    'SELECT COUNT(*) AS c FROM persona_state_fields WHERE world_id = ?',
  ).get(world.id).c;
  const characterFieldCount = sandbox.db.prepare(
    'SELECT COUNT(*) AS c FROM character_state_fields WHERE world_id = ?',
  ).get(world.id).c;
  assert.equal(personaFieldCount, 0);
  assert.equal(characterFieldCount, 0);

  // 世界状态值：weather 已按默认值初始化
  const worldValues = sandbox.db.prepare(`
    SELECT field_key, default_value_json FROM world_state_values WHERE world_id = ? AND field_key = 'weather'
  `).all(world.id);
  assert.deepEqual(worldValues, [
    { field_key: 'weather', default_value_json: '晴' },
  ]);

  const persona = sandbox.db.prepare('SELECT id FROM personas WHERE world_id = ?').get(world.id);
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
