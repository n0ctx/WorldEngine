import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import { insertCharacter, insertMessage, insertSession, insertWorld } from '../helpers/fixtures.js';

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
