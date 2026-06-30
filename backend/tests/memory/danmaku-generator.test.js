import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import { insertSession, insertMessage, insertWorld } from '../helpers/fixtures.js';

const sandbox = createTestSandbox('danmaku-generator-suite');

before(() => {
  sandbox.setEnv();
});

after(() => {
  resetMockEnv();
  sandbox.cleanup();
});

function seedTurn(name) {
  const world = insertWorld(sandbox.db, { name });
  const session = insertSession(sandbox.db, { mode: 'chat', world_id: world.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '我推开酒馆的门走了进去。' });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '一阵喧闹后，所有人都看向了你。' });
  return session;
}

test('generateDanmaku：正常返回 JSON 字符串数组，按 count 截断，并持久化到最新 assistant 消息', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([
    '["前排围观","这就开始了？","主角光环","哈哈哈哈","name对",6,"超出条数的应被截断"]',
  ]);

  const session = seedTurn('弹幕世界一');
  const { generateDanmaku } = await freshImport('backend/memory/danmaku-generator.js');
  const comments = await generateDanmaku(session.id, { mode: 'chat' });

  assert.ok(Array.isArray(comments));
  // 默认 count=5 → 截断到 5 条
  assert.equal(comments.length, 5);
  assert.equal(comments[0], '前排围观');
  // 数字项被转成字符串后保留（非空）
  assert.ok(comments.every((c) => typeof c === 'string' && c.length > 0));

  // 已落库到最新 assistant 消息的 danmaku 字段
  const { getLatestAssistantMessageId, getMessageById } = await freshImport('backend/db/queries/messages.js');
  const assistantId = getLatestAssistantMessageId(session.id);
  const row = getMessageById(assistantId);
  assert.deepEqual(row.danmaku, comments);
});

test('generateDanmaku：写作 session 同样能取最新一轮并持久化', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify(['["写作弹幕一","写作弹幕二"]']);

  const world = insertWorld(sandbox.db, { name: '弹幕写作世界' });
  const session = insertSession(sandbox.db, { mode: 'writing', world_id: world.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '夜色里我握紧了短刀。' });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '巷子尽头传来脚步声。' });

  const { generateDanmaku } = await freshImport('backend/memory/danmaku-generator.js');
  const comments = await generateDanmaku(session.id, { mode: 'writing' });

  assert.deepEqual(comments, ['写作弹幕一', '写作弹幕二']);
  const { getLatestAssistantMessageId, getMessageById } = await freshImport('backend/db/queries/messages.js');
  const row = getMessageById(getLatestAssistantMessageId(session.id));
  assert.deepEqual(row.danmaku, comments);
});

test('updateMessageDanmaku：传空数组清空字段（删除/回退语义的底座）', async () => {
  resetMockEnv();
  const session = seedTurn('弹幕世界清空');
  const { getLatestAssistantMessageId, getMessageById, updateMessageDanmaku } =
    await freshImport('backend/db/queries/messages.js');
  const id = getLatestAssistantMessageId(session.id);
  updateMessageDanmaku(id, ['临时弹幕']);
  assert.deepEqual(getMessageById(id).danmaku, ['临时弹幕']);
  updateMessageDanmaku(id, []);
  assert.equal(getMessageById(id).danmaku, null);
});

test('generateDanmaku：智能引号+代码块包裹仍能解析（日志里的真实形态）', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([
    '```json\n[ “这堕落速度，快进到彻底沦陷了”, “一块饼干一次，这物价太魔幻了” ]\n```',
  ]);
  const session = seedTurn('弹幕智能引号');
  const { generateDanmaku } = await freshImport('backend/memory/danmaku-generator.js');
  const comments = await generateDanmaku(session.id, { mode: 'chat' });
  assert.deepEqual(comments, ['这堕落速度，快进到彻底沦陷了', '一块饼干一次，这物价太魔幻了']);
});

test('generateDanmaku：数组被截断（无收尾]）时正则兜底抽取', async () => {
  resetMockEnv();
  // 模型输出在 maxTokens 处被截断，最后一条不完整且无闭合 ]
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([
    '["前排围观","主角光环","这剧情我直接看麻了","末日体育生属实会',
  ]);
  const session = seedTurn('弹幕截断');
  const { generateDanmaku } = await freshImport('backend/memory/danmaku-generator.js');
  const comments = await generateDanmaku(session.id, { mode: 'chat' });
  // 完整的三条被救回（不完整的末条不带闭合引号，正则不收）
  assert.deepEqual(comments, ['前排围观', '主角光环', '这剧情我直接看麻了']);
});

test('generateDanmaku：非法 JSON 返回空数组，不抛出', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify(['这不是 JSON，只是一段闲聊。']);

  const session = seedTurn('弹幕世界二');
  const { generateDanmaku } = await freshImport('backend/memory/danmaku-generator.js');
  const comments = await generateDanmaku(session.id, { mode: 'chat' });

  assert.deepEqual(comments, []);
});

test('generateDanmaku：无本轮文本时直接返回空数组', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify(['["不该被用到"]']);

  const world = insertWorld(sandbox.db, { name: '弹幕世界三' });
  const session = insertSession(sandbox.db, { mode: 'chat', world_id: world.id });
  const { generateDanmaku } = await freshImport('backend/memory/danmaku-generator.js');
  const comments = await generateDanmaku(session.id, { mode: 'chat' });

  assert.deepEqual(comments, []);
});

test('generateDanmaku：LLM 抛错时吞掉异常返回空数组', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE_ERROR = '模拟副模型调用失败';

  const session = seedTurn('弹幕世界四');
  const { generateDanmaku } = await freshImport('backend/memory/danmaku-generator.js');
  const comments = await generateDanmaku(session.id, { mode: 'chat' });

  assert.deepEqual(comments, []);
});
