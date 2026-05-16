import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import { insertCharacter, insertMessage, insertSession, insertWorld } from '../helpers/fixtures.js';

const sandbox = createTestSandbox('service-chat-suite', {
  global_system_prompt: '系统：{{world}}',
  context_history_rounds: 1,
});
sandbox.setEnv();

after(() => sandbox.cleanup());

test('buildContext 会返回 messages、override 参数与 recallHitCount', async () => {
  const world = insertWorld(sandbox.db, { name: '聊天世界', temperature: 0.4, max_tokens: 222 });
  const character = insertCharacter(sandbox.db, world.id, { name: '伊奈' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '你好', created_at: 1 });

  const { buildContext } = await freshImport('backend/services/chat.js');
  const result = await buildContext(session.id);

  assert.equal(result.overrides.temperature, 0.4);
  assert.equal(result.overrides.maxTokens, 222);
  assert.equal(result.recallHitCount, 0);
  assert.equal(Array.isArray(result.messages), true);
  assert.match(result.messages[0].content, /系统：聊天世界/);
});

test('processStreamOutput 在正常完成时会剥离选项、套 ai_output 规则并写入 assistant 消息', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '聊天世界-后处理' });
  const session = insertSession(sandbox.db, { character_id: insertCharacter(sandbox.db, world.id).id });
  sandbox.db.prepare(`
    INSERT INTO regex_rules (id, name, enabled, pattern, replacement, flags, scope, world_id, mode, sort_order, created_at, updated_at)
    VALUES ('rule-chat', '替换', 1, 'foo', 'bar', 'g', 'ai_output', ?, 'chat', 0, 1, 1)
  `).run(world.id);

  const { processStreamOutput } = await freshImport('backend/services/chat.js');
  const result = await processStreamOutput(
    'foo<next_prompt>选项一\n选项二</next_prompt>',
    false,
    world.id,
    session.id,
  );

  assert.equal(result.savedContent, 'bar');
  assert.deepEqual(result.options, ['选项一', '选项二']);
  assert.equal(result.savedAssistant.role, 'assistant');

  const row = sandbox.db.prepare(`
    SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(session.id);
  assert.deepEqual(row, { role: 'assistant', content: 'bar' });
});

test('processStreamOutput 在 aborted 时保留原始内容并追加中断标记', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '聊天世界-中断' });
  const session = insertSession(sandbox.db, { character_id: insertCharacter(sandbox.db, world.id).id });

  const { processStreamOutput } = await freshImport('backend/services/chat.js');
  const result = await processStreamOutput('未完成内容', true, world.id, session.id);

  assert.equal(result.options.length, 0);
  assert.match(result.savedContent, /未完成内容/);
  assert.match(result.savedContent, /\[已中断\]/);
});

test('processStreamOutput 解包 DeepSeek 全量 think 包裹——无 next_prompt', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '聊天世界-think解包' });
  const session = insertSession(sandbox.db, { character_id: insertCharacter(sandbox.db, world.id).id });

  const { processStreamOutput } = await freshImport('backend/services/chat.js');
  const result = await processStreamOutput(
    '<think>这是推理内容\n这是正文内容</think>\n',
    false,
    world.id,
    session.id,
  );

  assert.ok(result.savedAssistant, '消息应被保存');
  assert.match(result.savedContent, /正文内容/);
  assert.doesNotMatch(result.savedContent, /<think>/);
});

test('processStreamOutput 解包 DeepSeek 全量 think 包裹——含 next_prompt', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '聊天世界-think解包选项' });
  const session = insertSession(sandbox.db, { character_id: insertCharacter(sandbox.db, world.id).id });

  const { processStreamOutput } = await freshImport('backend/services/chat.js');
  const result = await processStreamOutput(
    '<think>推理内容\n正文<next_prompt>选项A\n选项B</next_prompt></think>',
    false,
    world.id,
    session.id,
  );

  assert.ok(result.savedAssistant, '消息应被保存');
  assert.match(result.savedContent, /正文/);
  assert.doesNotMatch(result.savedContent, /<think>/);
  assert.deepEqual(result.options, ['选项A', '选项B']);
});

test('processStreamOutput 保留正常混合内容（think + 正文）不解包', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '聊天世界-混合内容' });
  const session = insertSession(sandbox.db, { character_id: insertCharacter(sandbox.db, world.id).id });

  const { processStreamOutput } = await freshImport('backend/services/chat.js');
  const result = await processStreamOutput(
    '<think>推理</think>\n正常正文内容',
    false,
    world.id,
    session.id,
  );

  assert.ok(result.savedAssistant, '消息应被保存');
  assert.match(result.savedContent, /正常正文内容/);
  // think 标签在 DB 中保留，由前端 parseStreamingBlocks 渲染成折叠面板
  assert.match(result.savedContent, /<think>/);
});

test('processStreamOutput 在选项区未闭合时会用副模型兜底补齐选项', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE = '<next_prompt>\n继续追问真相\n直接拔剑试探\n假装离开再折返\n</next_prompt>';

  const world = insertWorld(sandbox.db, { name: '聊天世界-fallback' });
  const session = insertSession(sandbox.db, { character_id: insertCharacter(sandbox.db, world.id).id });

  const { processStreamOutput } = await freshImport('backend/services/chat.js');
  const result = await processStreamOutput('正文到这里结束', false, world.id, session.id, {
    suggestionEnabled: true,
    currentUserContent: '下一步怎么办？',
    configScope: 'aux',
  });

  assert.equal(result.savedContent, '正文到这里结束');
  assert.deepEqual(result.options, ['继续追问真相', '直接拔剑试探', '假装离开再折返']);
});

test('processStreamOutput 在选项区已完整闭合时不会触发副模型兜底', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE_ERROR = 'fallback should not run';

  const world = insertWorld(sandbox.db, { name: '聊天世界-no-fallback' });
  const session = insertSession(sandbox.db, { character_id: insertCharacter(sandbox.db, world.id).id });

  const { processStreamOutput } = await freshImport('backend/services/chat.js');
  const result = await processStreamOutput(
    '正文\n<next_prompt>\n选项甲\n选项乙\n选项丙\n</next_prompt>',
    false,
    world.id,
    session.id,
    {
      suggestionEnabled: true,
      currentUserContent: '继续',
      configScope: 'aux',
    },
  );

  assert.equal(result.savedContent, '正文');
  assert.deepEqual(result.options, ['选项甲', '选项乙', '选项丙']);
});

test('processStreamOutput 在副模型兜底失败时保留正文且不抛错', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE_ERROR = 'fallback failed';

  const world = insertWorld(sandbox.db, { name: '聊天世界-fallback失败' });
  const session = insertSession(sandbox.db, { character_id: insertCharacter(sandbox.db, world.id).id });

  const { processStreamOutput } = await freshImport('backend/services/chat.js');
  const result = await processStreamOutput('没有选项结尾', false, world.id, session.id, {
    suggestionEnabled: true,
    currentUserContent: '继续',
    configScope: 'aux',
  });

  assert.equal(result.savedContent, '没有选项结尾');
  assert.deepEqual(result.options, []);
});

test('processStreamOutput 的闭合检测会先剥离 think block，再决定是否触发兜底', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE_ERROR = 'fallback should not run';

  const world = insertWorld(sandbox.db, { name: '聊天世界-think检测' });
  const session = insertSession(sandbox.db, { character_id: insertCharacter(sandbox.db, world.id).id });

  const { processStreamOutput } = await freshImport('backend/services/chat.js');
  const result = await processStreamOutput(
    '正文\n<next_prompt>\n选项一\n选项二\n选项三\n</next_prompt>\n<think>补出的思维链</think>',
    false,
    world.id,
    session.id,
    {
      suggestionEnabled: true,
      currentUserContent: '继续',
      configScope: 'aux',
    },
  );

  assert.equal(result.savedContent, '正文');
  assert.deepEqual(result.options, ['选项一', '选项二', '选项三']);
});

test('processStreamOutput 在选项区闭合但只有 1-2 条时会删掉闭合标签走 continuation 补齐', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE = '<next_prompt>\n选项一\n选项二\n补齐的第三条\n</next_prompt>';

  const world = insertWorld(sandbox.db, { name: '聊天世界-补齐' });
  const session = insertSession(sandbox.db, { character_id: insertCharacter(sandbox.db, world.id).id });

  const { processStreamOutput } = await freshImport('backend/services/chat.js');
  const result = await processStreamOutput(
    '正文\n<next_prompt>\n选项一\n选项二\n</next_prompt>',
    false,
    world.id,
    session.id,
    {
      suggestionEnabled: true,
      currentUserContent: '继续',
      configScope: 'aux',
    },
  );

  assert.equal(result.savedContent, '正文');
  assert.deepEqual(result.options, ['选项一', '选项二', '补齐的第三条']);
});

test('processStreamOutput 在已存在 </next_prompt> 时会截掉最后一个闭合标签后的尾部内容', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE_ERROR = 'fallback should not run';

  const world = insertWorld(sandbox.db, { name: '聊天世界-tail清洗' });
  const session = insertSession(sandbox.db, { character_id: insertCharacter(sandbox.db, world.id).id });

  const { processStreamOutput } = await freshImport('backend/services/chat.js');
  const result = await processStreamOutput(
    '正文\n<next_prompt>\n选项一\n选项二\n选项三\n</next_prompt>\n这里是多余尾巴\n<think>尾部思维链</think>',
    false,
    world.id,
    session.id,
    {
      suggestionEnabled: true,
      currentUserContent: '继续',
      configScope: 'aux',
    },
  );

  assert.equal(result.savedContent, '正文');
  assert.deepEqual(result.options, ['选项一', '选项二', '选项三']);
});
