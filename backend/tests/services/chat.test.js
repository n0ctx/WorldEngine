import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
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
  const world = insertWorld(sandbox.db, { name: '聊天世界-后处理' });
  const session = insertSession(sandbox.db, { character_id: insertCharacter(sandbox.db, world.id).id });
  sandbox.db.prepare(`
    INSERT INTO regex_rules (id, name, enabled, pattern, replacement, flags, scope, world_id, mode, sort_order, created_at, updated_at)
    VALUES ('rule-chat', '替换', 1, 'foo', 'bar', 'g', 'ai_output', ?, 'chat', 0, 1, 1)
  `).run(world.id);

  const { processStreamOutput } = await freshImport('backend/services/chat.js');
  const result = processStreamOutput(
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
  const world = insertWorld(sandbox.db, { name: '聊天世界-中断' });
  const session = insertSession(sandbox.db, { character_id: insertCharacter(sandbox.db, world.id).id });

  const { processStreamOutput } = await freshImport('backend/services/chat.js');
  const result = processStreamOutput('未完成内容', true, world.id, session.id);

  assert.equal(result.options.length, 0);
  assert.match(result.savedContent, /未完成内容/);
  assert.match(result.savedContent, /\[已中断\]/);
});
