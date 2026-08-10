import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import {
  insertCharacter,
  insertCharacterStateField,
  insertCharacterStateValue,
  insertPersona,
  insertPersonaStateField,
  insertPersonaStateValue,
  insertWorld,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('service-state-extract');
sandbox.setEnv();

after(() => sandbox.cleanup());

beforeEach(() => {
  resetMockEnv();
});

test('extractCharacterStateSuggestions：正常提取并返回建议，含 current_value_json', async () => {
  const world = insertWorld(sandbox.db, { name: '提取-世界' });
  insertCharacterStateField(sandbox.db, world.id, {
    field_key: 'personality', label: '性格', type: 'list',
  });
  insertCharacterStateField(sandbox.db, world.id, {
    field_key: 'age', label: '年龄', type: 'number', min_value: 0, max_value: 200,
  });
  const character = insertCharacter(sandbox.db, world.id, {
    name: '阿绪',
    description: '一个内敛冷静的青年剑客，今年23岁，沉默寡言但重情义。',
  });
  // 已有当前值：age=20（模拟旧值），供 current_value_json 断言
  insertCharacterStateValue(sandbox.db, character.id, {
    field_key: 'age', default_value_json: JSON.stringify(20),
  });

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    personality: ['冷静', '重情义'],
    age: 23,
  });

  const { extractCharacterStateSuggestions } = await freshImport('backend/services/state-extract.js');
  const result = await extractCharacterStateSuggestions(character.id);

  assert.equal(result.length, 2);
  const byKey = Object.fromEntries(result.map((r) => [r.field_key, r]));
  assert.deepEqual(JSON.parse(byKey.personality.suggested_value_json), ['冷静', '重情义']);
  assert.equal(byKey.personality.current_value_json, null);
  assert.equal(byKey.age.suggested_value_json, JSON.stringify(23));
  assert.equal(byKey.age.current_value_json, JSON.stringify(20));
  assert.equal(byKey.age.label, '年龄');
  assert.equal(byKey.age.type, 'number');
});

test('extractPersonaStateSuggestions：模型返回 ```json 代码块包裹也能解析', async () => {
  const world = insertWorld(sandbox.db, { name: '提取-代码块-世界' });
  insertPersonaStateField(sandbox.db, world.id, { field_key: 'identity', label: '身份', type: 'text' });
  const persona = insertPersona(sandbox.db, world.id, {
    name: '旅人',
    description: '一名孤身赶路的商队向导。',
  });

  process.env.MOCK_LLM_COMPLETE = '这是我的分析：\n```json\n{"identity": "商队向导"}\n```\n完成。';

  const { extractPersonaStateSuggestions } = await freshImport('backend/services/state-extract.js');
  const result = await extractPersonaStateSuggestions(persona.id);

  assert.equal(result.length, 1);
  assert.equal(result[0].field_key, 'identity');
  assert.equal(result[0].suggested_value_json, JSON.stringify('商队向导'));
});

test('extractCharacterStateSuggestions：非法值（enum 不在选项内 / number 给字符串 / list 给数字）被丢弃', async () => {
  const world = insertWorld(sandbox.db, { name: '提取-非法值-世界' });
  insertCharacterStateField(sandbox.db, world.id, {
    field_key: 'mood', label: '心情', type: 'enum', enum_options: ['开心', '难过'],
  });
  insertCharacterStateField(sandbox.db, world.id, {
    field_key: 'age', label: '年龄', type: 'number',
  });
  insertCharacterStateField(sandbox.db, world.id, {
    field_key: 'outfit', label: '穿着', type: 'list',
  });
  insertCharacterStateField(sandbox.db, world.id, {
    field_key: 'identity', label: '身份', type: 'list',
  });
  const character = insertCharacter(sandbox.db, world.id, { name: '测试角色', description: '随便写点什么。' });

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    mood: '愤怒',       // 不在 enum_options 内
    age: 'abc',         // 无法转换为数字
    outfit: 12345,      // 既不是数组也不是字符串
    identity: ['旅人'], // 合法，用于确认其他字段未被误伤
  });

  const { extractCharacterStateSuggestions } = await freshImport('backend/services/state-extract.js');
  const result = await extractCharacterStateSuggestions(character.id);

  assert.equal(result.length, 1);
  assert.equal(result[0].field_key, 'identity');
});

test('人设为空（name/description/system_prompt 全空）时不调用 LLM，直接返回空数组', async () => {
  const world = insertWorld(sandbox.db, { name: '提取-空人设-世界' });
  insertCharacterStateField(sandbox.db, world.id, { field_key: 'age', label: '年龄', type: 'number' });
  const character = insertCharacter(sandbox.db, world.id, {
    name: '', description: '', system_prompt: '',
  });

  // 故意不设置 MOCK_LLM_COMPLETE：如果代码真的调用了 LLM，mock provider 会返回空字符串，
  // 触发 state-extract.js 里的 LLM_CALL_FAILED 抛错，从而让这个测试失败。
  const { extractCharacterStateSuggestions } = await freshImport('backend/services/state-extract.js');
  const result = await extractCharacterStateSuggestions(character.id);

  assert.deepEqual(result, []);
});

test('世界下没有任何角色状态字段时，直接返回空数组，不调用 LLM', async () => {
  const world = insertWorld(sandbox.db, { name: '提取-无字段-世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '有人设的角色', description: '一些描述。' });

  const { extractCharacterStateSuggestions } = await freshImport('backend/services/state-extract.js');
  const result = await extractCharacterStateSuggestions(character.id);

  assert.deepEqual(result, []);
});

test('extractCharacterStateSuggestions：角色不存在抛 NOT_FOUND', async () => {
  const { extractCharacterStateSuggestions } = await freshImport('backend/services/state-extract.js');
  await assert.rejects(
    () => extractCharacterStateSuggestions('no-such-character'),
    (err) => err.code === 'NOT_FOUND',
  );
});

test('extractPersonaStateSuggestions：玩家卡不存在抛 NOT_FOUND', async () => {
  const { extractPersonaStateSuggestions } = await freshImport('backend/services/state-extract.js');
  await assert.rejects(
    () => extractPersonaStateSuggestions('no-such-persona'),
    (err) => err.code === 'NOT_FOUND',
  );
});

test('extractCharacterStateSuggestions：LLM 返回非法 JSON 时抛 LLM_PARSE_FAILED', async () => {
  const world = insertWorld(sandbox.db, { name: '提取-坏JSON-世界' });
  insertCharacterStateField(sandbox.db, world.id, { field_key: 'age', label: '年龄', type: 'number' });
  const character = insertCharacter(sandbox.db, world.id, { name: '角色', description: '描述。' });

  process.env.MOCK_LLM_COMPLETE = '这不是 JSON';

  const { extractCharacterStateSuggestions } = await freshImport('backend/services/state-extract.js');
  await assert.rejects(
    () => extractCharacterStateSuggestions(character.id),
    (err) => err.code === 'LLM_PARSE_FAILED',
  );
});
