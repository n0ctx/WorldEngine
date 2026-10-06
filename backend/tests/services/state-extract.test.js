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

test('档案字段也参与推断：带 profile_key，当前值取卡片上的档案初始值；玩家卡没有人格字段', async () => {
  const world = insertWorld(sandbox.db, { name: '提取-档案-世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '有人设的角色', description: '一位沉默的女剑客。' });
  sandbox.db.prepare('UPDATE characters SET profile_defaults_json = ? WHERE id = ?').run(JSON.stringify({ gender: '男' }), character.id);
  const persona = insertPersona(sandbox.db, world.id, { name: '旅人', description: '一名向导。' });

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    'profile.gender': '女',
    'profile.core_traits': ['沉默'],
    'profile.no_such_field': '忽略',
  });
  const { extractCharacterStateSuggestions, extractPersonaStateSuggestions } = await freshImport('backend/services/state-extract.js');
  const result = await extractCharacterStateSuggestions(character.id);

  const byKey = Object.fromEntries(result.map((r) => [r.field_key, r]));
  assert.deepEqual(Object.keys(byKey).sort(), ['profile.core_traits', 'profile.gender']);
  assert.equal(byKey['profile.gender'].profile_key, 'gender');
  assert.equal(byKey['profile.gender'].label, '身份·性别');
  assert.equal(byKey['profile.gender'].current_value_json, JSON.stringify('男'));
  assert.deepEqual(JSON.parse(byKey['profile.core_traits'].suggested_value_json), ['沉默']);

  const personaResult = await extractPersonaStateSuggestions(persona.id);
  assert.deepEqual(personaResult.map((r) => r.field_key), ['profile.gender'], '玩家卡没有人格字段');
});

test('出生日期：写明的照用；只给年龄时按世界开场日期倒推；年龄本身不作为建议返回', async () => {
  const world = insertWorld(sandbox.db, { name: '提取-出生日期-世界' });
  sandbox.db.prepare('UPDATE worlds SET profile_defaults_json = ? WHERE id = ?').run(JSON.stringify({ time: '1005-03-15T08:00' }), world.id);
  const character = insertCharacter(sandbox.db, world.id, { name: '少年', description: '十七岁的学徒。' });
  const { extractCharacterStateSuggestions } = await freshImport('backend/services/state-extract.js');
  const birthDateOf = async () => {
    const result = await extractCharacterStateSuggestions(character.id);
    assert.ok(result.every((r) => r.field_key !== 'profile.age'));
    return result.find((r) => r.field_key === 'profile.birth_date')?.suggested_value_json;
  };

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ 'profile.age': 17 });
  assert.equal(await birthDateOf(), JSON.stringify('988-03-15'));

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ 'profile.birth_date': '987-11-02', 'profile.age': 17 });
  assert.equal(await birthDateOf(), JSON.stringify('987-11-02'));

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ 'profile.birth_date': '春天', 'profile.age': 17 });
  assert.equal(await birthDateOf(), JSON.stringify('988-03-15'), '格式不对的出生日期改用年龄倒推');

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ 'profile.birth_date': '春天' });
  assert.equal(await birthDateOf(), undefined);

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ 'profile.age': 1005 });
  assert.equal(await birthDateOf(), undefined, '倒推出的年份不是正数时放弃');

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ 'profile.age': 16.5 });
  assert.equal(await birthDateOf(), undefined, '年龄须为整数');
});

test('出生日期：世界没有开场日期时不按年龄倒推', async () => {
  const world = insertWorld(sandbox.db, { name: '提取-无开场日期-世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '少年', description: '十七岁的学徒。' });

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ 'profile.age': 17 });
  const { extractCharacterStateSuggestions } = await freshImport('backend/services/state-extract.js');
  assert.deepEqual(await extractCharacterStateSuggestions(character.id), []);
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
