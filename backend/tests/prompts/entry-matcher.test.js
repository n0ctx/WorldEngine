import test, { after, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import {
  insertCharacter,
  insertMessage,
  insertSession,
  insertWorld,
  insertWorldEntry,
  insertEntryCondition,
  insertWorldStateField,
  insertSessionWorldStateValue,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('entry-suite');
sandbox.setEnv();
after(() => {
  resetMockEnv();
  sandbox.cleanup();
});

test('resolveKeywordScopes 兼容 both 和空值', async () => {
  const { __testables } = await freshImport('backend/prompts/entry-matcher.js');
  assert.deepEqual([...__testables.resolveKeywordScopes('both')], ['user', 'assistant']);
  assert.deepEqual([...__testables.resolveKeywordScopes('')], ['user', 'assistant']);
  assert.deepEqual([...__testables.resolveKeywordScopes('assistant')], ['assistant']);
});

test('matchByKeywords 按 scope 且大小写不敏感匹配', async () => {
  const { __testables } = await freshImport('backend/prompts/entry-matcher.js');
  const entry = {
    keywords: ['Dragon'],
    keyword_scope: 'assistant',
  };
  assert.equal(__testables.matchByKeywords(entry, 'dragon', 'nothing'), false);
  assert.equal(__testables.matchByKeywords(entry, 'nothing', 'a dragon appears'), true);
});

test('matchEntries 在 LLM 失败时降级到关键词匹配', async () => {
  const world = insertWorld(sandbox.db);
  const character = insertCharacter(sandbox.db, world.id);
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '之前谈到王城。', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '我想回到王城。', created_at: 2 });
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE_ERROR = 'mock fail';

  const { matchEntries } = await freshImport('backend/prompts/entry-matcher.js');
  const matched = await matchEntries(session.id, [
    { id: 'entry-1', title: '王城', description: '当用户想回城时触发', keywords: ['王城'], keyword_scope: 'user' },
  ]);

  assert.deepEqual([...matched], ['entry-1']);
});

test('matchEntries 在 LLM 返回编号 JSON 时命中 description 条目', async () => {
  const world = insertWorld(sandbox.db);
  const character = insertCharacter(sandbox.db, world.id);
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: 'AI 提醒。', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '请安排宴会。', created_at: 2 });
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE = '[1]';

  const { matchEntries } = await freshImport('backend/prompts/entry-matcher.js');
  const matched = await matchEntries(session.id, [
    { id: 'entry-llm', title: '宴会规则', description: '用户提到宴会时触发', keywords: [], keyword_scope: 'user', trigger_type: 'llm' },
  ]);

  assert.deepEqual([...matched], ['entry-llm']);
});

test('trigger_type=always 直接触发，不走关键词匹配', async () => {
  const world = insertWorld(sandbox.db);
  const character = insertCharacter(sandbox.db, world.id);
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '今天天气不错。', created_at: 1 });
  resetMockEnv();

  const { matchEntries } = await freshImport('backend/prompts/entry-matcher.js');
  // 关键词为"龙"，消息中不含"龙"，但 trigger_type=always 应直接触发
  const matched = await matchEntries(session.id, [
    { id: 'entry-always', title: '常驻背景', keywords: ['龙'], keyword_scope: 'user', trigger_type: 'always' },
  ]);

  assert.deepEqual([...matched], ['entry-always']);
});

test('trigger_type=keyword 关键词命中时触发', async () => {
  const world = insertWorld(sandbox.db);
  const character = insertCharacter(sandbox.db, world.id);
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '我想了解暗影帮。', created_at: 1 });
  resetMockEnv();

  const { matchEntries } = await freshImport('backend/prompts/entry-matcher.js');
  const matched = await matchEntries(session.id, [
    { id: 'entry-kw', title: '暗影帮内情', keywords: ['暗影帮'], keyword_scope: 'user', trigger_type: 'keyword' },
  ]);

  assert.deepEqual([...matched], ['entry-kw']);
});

test('trigger_type=keyword 关键词不匹配时不触发', async () => {
  const world = insertWorld(sandbox.db);
  const character = insertCharacter(sandbox.db, world.id);
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '今天风和日丽。', created_at: 1 });
  resetMockEnv();

  const { matchEntries } = await freshImport('backend/prompts/entry-matcher.js');
  const matched = await matchEntries(session.id, [
    { id: 'entry-kw2', title: '暗影帮内情', keywords: ['暗影帮'], keyword_scope: 'user', trigger_type: 'keyword' },
  ]);

  assert.equal(matched.size, 0);
});

test('trigger_type 缺失（null/undefined）视为 always 直接触发', async () => {
  const world = insertWorld(sandbox.db);
  const character = insertCharacter(sandbox.db, world.id);
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '普通消息。', created_at: 1 });
  resetMockEnv();

  const { matchEntries } = await freshImport('backend/prompts/entry-matcher.js');
  // trigger_type 未设置 → 视为 always
  const matched = await matchEntries(session.id, [
    { id: 'entry-no-type', title: '旧数据条目', keywords: ['不存在的词'], keyword_scope: 'user' },
  ]);

  assert.deepEqual([...matched], ['entry-no-type']);
});

test('trigger_type=llm LLM 失败时关键词兜底命中', async () => {
  const world = insertWorld(sandbox.db);
  const character = insertCharacter(sandbox.db, world.id);
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '进入王城了。', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '我要去王城。', created_at: 2 });
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE_ERROR = 'mock fail';

  const { matchEntries } = await freshImport('backend/prompts/entry-matcher.js');
  const matched = await matchEntries(session.id, [
    { id: 'entry-llm-kb', title: '王城详情', description: '用户提到王城时触发', keywords: ['王城'], keyword_scope: 'user', trigger_type: 'llm' },
  ]);

  assert.deepEqual([...matched], ['entry-llm-kb']);
});

// ─── state 分支集成测试 ─────────────────────────────────────
describe('matchEntries — state 类型条件评估', () => {
  test('单条件满足时命中 state 条目', async () => {
    const world = insertWorld(sandbox.db, { name: '状态条目世界-A' });
    const character = insertCharacter(sandbox.db, world.id, { name: '测试角色' });
    const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id, mode: 'chat' });

    // 建状态字段 + 设置会话值
    insertWorldStateField(sandbox.db, world.id, { field_key: 'hp', label: '体力', type: 'number', sort_order: 0 });
    insertSessionWorldStateValue(sandbox.db, session.id, world.id, { field_key: 'hp', runtime_value_json: '25' });

    // 建 state 条目 + 设置条件：世界.体力 < 30
    const entry = insertWorldEntry(sandbox.db, world.id, { title: '低血量提醒', trigger_type: 'state', content: '注意体力不足' });
    insertEntryCondition(sandbox.db, entry.id, { target_field: '世界.体力', operator: '<', value: '30' });

    resetMockEnv();
    const { matchEntries } = await freshImport('backend/prompts/entry-matcher.js');
    const matched = await matchEntries(session.id, [{ ...entry }], world.id);
    assert.ok(matched.has(entry.id), '体力 25 < 30，应命中');
  });

  test('条件不满足时 state 条目不触发', async () => {
    const world = insertWorld(sandbox.db, { name: '状态条目世界-B' });
    const character = insertCharacter(sandbox.db, world.id, { name: '测试角色B' });
    const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id, mode: 'chat' });

    insertWorldStateField(sandbox.db, world.id, { field_key: 'hp2', label: '生命', type: 'number', sort_order: 0 });
    insertSessionWorldStateValue(sandbox.db, session.id, world.id, { field_key: 'hp2', runtime_value_json: '80' });

    const entry = insertWorldEntry(sandbox.db, world.id, { title: '低血量提醒B', trigger_type: 'state', content: '...' });
    insertEntryCondition(sandbox.db, entry.id, { target_field: '世界.生命', operator: '<', value: '30' });

    resetMockEnv();
    const { matchEntries } = await freshImport('backend/prompts/entry-matcher.js');
    const matched = await matchEntries(session.id, [{ ...entry }], world.id);
    assert.ok(!matched.has(entry.id), '生命 80 不满足 < 30，不应命中');
  });

  test('多条件 AND 逻辑：所有条件满足才触发', async () => {
    const world = insertWorld(sandbox.db, { name: '状态条目世界-C' });
    const character = insertCharacter(sandbox.db, world.id, { name: '测试角色C' });
    const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id, mode: 'chat' });

    insertWorldStateField(sandbox.db, world.id, { field_key: 'hp3', label: '耐力', type: 'number', sort_order: 0 });
    insertWorldStateField(sandbox.db, world.id, { field_key: 'status', label: '状态', type: 'text', sort_order: 1 });
    insertSessionWorldStateValue(sandbox.db, session.id, world.id, { field_key: 'hp3', runtime_value_json: '20' });
    insertSessionWorldStateValue(sandbox.db, session.id, world.id, { field_key: 'status', runtime_value_json: '"危机"' });

    const entry = insertWorldEntry(sandbox.db, world.id, { title: '双条件', trigger_type: 'state', content: '...' });
    insertEntryCondition(sandbox.db, entry.id, { target_field: '世界.耐力', operator: '<', value: '30' });
    insertEntryCondition(sandbox.db, entry.id, { target_field: '世界.状态', operator: '等于', value: '危机' });

    resetMockEnv();
    const { matchEntries } = await freshImport('backend/prompts/entry-matcher.js');
    const matched = await matchEntries(session.id, [{ ...entry }], world.id);
    assert.ok(matched.has(entry.id), 'AND 条件全满足，应命中');
  });

  test('state 条目无条件时不触发', async () => {
    const world = insertWorld(sandbox.db, { name: '状态条目世界-D' });
    const character = insertCharacter(sandbox.db, world.id, { name: '测试角色D' });
    const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id, mode: 'chat' });

    const entry = insertWorldEntry(sandbox.db, world.id, { title: '空条件', trigger_type: 'state', content: '...' });
    // 不添加任何 entry_conditions

    resetMockEnv();
    const { matchEntries } = await freshImport('backend/prompts/entry-matcher.js');
    const matched = await matchEntries(session.id, [{ ...entry }], world.id);
    assert.ok(!matched.has(entry.id), '无条件的 state 条目不应触发');
  });
});
