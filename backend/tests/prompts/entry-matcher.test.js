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

test('matchByKeywords keyword_logic=AND 全部命中才触发', async () => {
  const { __testables } = await freshImport('backend/prompts/entry-matcher.js');
  const entry = { keywords: ['A', 'B'], keyword_scope: 'user', keyword_logic: 'AND' };
  // 仅含 A：不命中
  assert.equal(__testables.matchByKeywords(entry, 'only a here', ''), false);
  // A + B 都在 user：命中
  assert.equal(__testables.matchByKeywords(entry, 'a and b together', ''), true);
});

test('matchByKeywords keyword_logic=OR 任一命中即触发', async () => {
  const { __testables } = await freshImport('backend/prompts/entry-matcher.js');
  const entry = { keywords: ['A', 'B'], keyword_scope: 'user', keyword_logic: 'OR' };
  assert.equal(__testables.matchByKeywords(entry, 'only a here', ''), true);
  assert.equal(__testables.matchByKeywords(entry, 'nothing', ''), false);
});

test('matchByKeywords AND 跨 scope 合集计数（user 和 assistant 各出现一次也算全命中）', async () => {
  const { __testables } = await freshImport('backend/prompts/entry-matcher.js');
  const entry = { keywords: ['A', 'B'], keyword_scope: 'user,assistant', keyword_logic: 'AND' };
  assert.equal(__testables.matchByKeywords(entry, 'has a only', 'has b only'), true);
});

test('matchByKeywords keyword_scope 限定为 user 时 assistant 中的关键词不算命中', async () => {
  const { __testables } = await freshImport('backend/prompts/entry-matcher.js');
  const entry = { keywords: ['x'], keyword_scope: 'user', keyword_logic: 'OR' };
  assert.equal(__testables.matchByKeywords(entry, 'nothing', 'has x here'), false);
  assert.equal(__testables.matchByKeywords(entry, 'has x', ''), true);
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

    resetMockEnv();
    const { matchEntries } = await freshImport('backend/prompts/entry-matcher.js');
    const matched = await matchEntries(session.id, [{ ...entry }], world.id);
    assert.ok(!matched.has(entry.id), '无条件的 state 条目不应触发');
  });
});

// ─── 关键词 active_turns 跨轮持续生效 ────────────────────────
// 注：keyword 匹配只扫最新一条 user / assistant 消息（"本轮"），跨轮持续完全由 active_turns 控制：
//   active_turns=1 → 仅命中当轮；active_turns=N → 命中当轮 + 后续 N-1 轮 carry-over；active_turns=0 → 永久。
describe('matchEntries — keyword active_turns 跨轮持续', () => {
  function pushAssistantUserPair(db, sessionId, base, userText = '其他内容') {
    insertMessage(db, sessionId, { role: 'assistant', content: 'a', created_at: base });
    insertMessage(db, sessionId, { role: 'user', content: userText, created_at: base + 1 });
  }

  test('active_turns=1：下一轮新消息不含关键词时立即失效', async () => {
    const world = insertWorld(sandbox.db, { name: 'TTL-1' });
    const character = insertCharacter(sandbox.db, world.id, { name: '角色TTL1' });
    const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id, mode: 'chat' });
    insertMessage(sandbox.db, session.id, { role: 'user', content: '我看到龙', created_at: 1 });
    resetMockEnv();

    const { matchEntries } = await freshImport('backend/prompts/entry-matcher.js');
    const entry = { id: 'kw-ttl-1', title: '龙', keywords: ['龙'], keyword_scope: 'user', keyword_logic: 'OR', trigger_type: 'keyword', active_turns: 1 };

    // 轮 1：本轮命中
    let matched = await matchEntries(session.id, [entry], world.id);
    assert.ok(matched.has(entry.id), '轮 1 命中');

    // 轮 2：新 user 消息不含关键词，无 fresh hit；carry-over: round=1, ttl=1, 2-1=1 不 <1 → 失效
    pushAssistantUserPair(sandbox.db, session.id, 2);
    matched = await matchEntries(session.id, [entry], world.id);
    assert.ok(!matched.has(entry.id), '轮 2 不应再触发（active_turns=1 仅本轮）');

    // 轮 3：依然不应触发
    pushAssistantUserPair(sandbox.db, session.id, 4);
    matched = await matchEntries(session.id, [entry], world.id);
    assert.ok(!matched.has(entry.id), '轮 3 仍不触发');
  });

  test('active_turns=3：命中当轮 + 后续 2 轮 carry-over，第 4 轮失效', async () => {
    const world = insertWorld(sandbox.db, { name: 'TTL-3' });
    const character = insertCharacter(sandbox.db, world.id, { name: '角色TTL3' });
    const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id, mode: 'chat' });
    insertMessage(sandbox.db, session.id, { role: 'user', content: '提到龙', created_at: 1 });
    resetMockEnv();

    const { matchEntries } = await freshImport('backend/prompts/entry-matcher.js');
    const entry = { id: 'kw-ttl-3', title: '龙', keywords: ['龙'], keyword_scope: 'user', keyword_logic: 'OR', trigger_type: 'keyword', active_turns: 3 };

    // 轮 1：fresh hit, round=1, ttl=3
    let matched = await matchEntries(session.id, [entry], world.id);
    assert.ok(matched.has(entry.id), '轮 1');

    // 轮 2：新消息不含关键词，carry-over: 2-1=1<3 → active
    pushAssistantUserPair(sandbox.db, session.id, 2);
    matched = await matchEntries(session.id, [entry], world.id);
    assert.ok(matched.has(entry.id), '轮 2 carry-over');

    // 轮 3：3-1=2<3 → active
    pushAssistantUserPair(sandbox.db, session.id, 4);
    matched = await matchEntries(session.id, [entry], world.id);
    assert.ok(matched.has(entry.id), '轮 3 carry-over');

    // 轮 4：4-1=3 不 <3 → 失效
    pushAssistantUserPair(sandbox.db, session.id, 6);
    matched = await matchEntries(session.id, [entry], world.id);
    assert.ok(!matched.has(entry.id), '轮 4 carry-over 已耗尽');
  });

  test('历史回退到激活点之前时，carry-over 自动失效（防止幽灵注入）', async () => {
    const world = insertWorld(sandbox.db, { name: 'TTL-rewind' });
    const character = insertCharacter(sandbox.db, world.id, { name: '角色rewind' });
    const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id, mode: 'chat' });
    insertMessage(sandbox.db, session.id, { role: 'user', content: '提到龙', created_at: 1 });
    resetMockEnv();

    const { matchEntries } = await freshImport('backend/prompts/entry-matcher.js');
    // active_turns=0 永久条目，最容易出现幽灵注入
    const entry = { id: 'kw-rewind', title: '龙', keywords: ['龙'], keyword_scope: 'user', keyword_logic: 'OR', trigger_type: 'keyword', active_turns: 0 };

    let matched = await matchEntries(session.id, [entry], world.id);
    assert.ok(matched.has(entry.id), '轮 1 命中并写入 keyword_active_state');

    // 模拟用户清空会话：删除所有消息（currentRound 归 0），但 keyword_active_state 仍持有 round=1
    sandbox.db.prepare('DELETE FROM messages WHERE session_id = ?').run(session.id);
    matched = await matchEntries(session.id, [entry], world.id);
    assert.ok(!matched.has(entry.id), '历史被清空后，旧 carry-over (round=1) > currentRound=0，应丢弃');
  });

  test('active_turns=0：关键词永久注入', async () => {
    const world = insertWorld(sandbox.db, { name: 'TTL-0' });
    const character = insertCharacter(sandbox.db, world.id, { name: '角色TTL0' });
    const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id, mode: 'chat' });
    insertMessage(sandbox.db, session.id, { role: 'user', content: '提到龙', created_at: 1 });
    resetMockEnv();

    const { matchEntries } = await freshImport('backend/prompts/entry-matcher.js');
    const entry = { id: 'kw-ttl-0', title: '龙', keywords: ['龙'], keyword_scope: 'user', keyword_logic: 'OR', trigger_type: 'keyword', active_turns: 0 };

    let matched = await matchEntries(session.id, [entry], world.id);
    assert.ok(matched.has(entry.id), '轮 1');

    // 推 6 轮无关键词，ttl=0 永久生效
    for (let i = 0; i < 6; i++) {
      pushAssistantUserPair(sandbox.db, session.id, 2 + i * 2);
      matched = await matchEntries(session.id, [entry], world.id);
      assert.ok(matched.has(entry.id), `第 ${i + 2} 轮仍应永久注入`);
    }
  });

});
