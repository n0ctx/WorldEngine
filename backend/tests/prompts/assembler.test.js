import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, writeUploadFile } from '../helpers/test-env.js';
import {
  insertCharacter,
  insertCharacterEntry,
  insertMessage,
  insertPersona,
  insertSession,
  insertWorld,
  insertWorldEntry,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('assembler-suite');
sandbox.setEnv();
after(() => sandbox.cleanup());

test('formatMessageForLLM 在有图片附件时输出 vision 内容数组', async () => {
  writeUploadFile(sandbox, 'attachments/pic.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const { __testables } = await freshImport('backend/prompts/assembler.js');
  const formatted = __testables.formatMessageForLLM({
    role: 'user',
    content: '看图',
    attachments: ['attachments/pic.png'],
  });

  assert.equal(formatted.role, 'user');
  assert.equal(Array.isArray(formatted.content), true);
  assert.equal(formatted.content[0].text, '看图');
  assert.match(formatted.content[1].image_url.url, /^data:image\/png;base64,/);
});

test('omitLatestUserMessage 在没有 user 消息时保持原数组', async () => {
  const { __testables } = await freshImport('backend/prompts/assembler.js');
  const input = [{ role: 'assistant', content: 'hello' }];
  assert.deepEqual(__testables.omitLatestUserMessage(input), input);
});

test('buildPrompt 组装系统段、历史消息、post prompt 和当前用户消息', async () => {
  sandbox.writeConfig({
    ...sandbox.readConfig(),
    global_system_prompt: '全局系统：{{world}}',
    global_post_prompt: '全局后置：{{char}}',
    context_history_rounds: 2,
    llm: {
      provider: 'mock',
      provider_keys: {},
      provider_models: {},
      base_url: '',
      model: 'mock-model',
      temperature: 0.7,
      max_tokens: 300,
      thinking_level: null,
    },
  });

  const world = insertWorld(sandbox.db, {
    name: '群星海',
    system_prompt: '世界设定：{{world}}',
    post_prompt: '世界后置',
    temperature: 0.2,
    max_tokens: 120,
  });
  insertPersona(sandbox.db, world.id, { name: '旅者', system_prompt: '玩家身份：{{user}}' });
  const character = insertCharacter(sandbox.db, world.id, {
    name: '阿塔',
    system_prompt: '角色设定：{{char}}',
    post_prompt: '角色后置',
  });
  insertWorldEntry(sandbox.db, world.id, {
    title: '世界条目',
    content: '世界知识：{{world}}',
    keywords: ['第二轮'],
    keyword_scope: 'user',
  });
  insertCharacterEntry(sandbox.db, character.id, {
    title: '角色条目',
    content: '角色知识：{{char}}',
    keywords: ['第二轮'],
    keyword_scope: 'user',
  });
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '第一轮提问', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '第一轮回答', created_at: 2 });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '第二轮提问', created_at: 3 });

  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');
  const result = await buildPrompt(session.id);

  assert.equal(result.temperature, 0.2);
  assert.equal(result.maxTokens, 120);
  assert.equal(result.recallHitCount, 0);
  assert.equal(result.messages.length, 5);
  assert.match(result.messages[0].content, /全局系统：群星海/);
  assert.match(result.messages[0].content, /玩家身份：旅者/);
  assert.match(result.messages[0].content, /角色知识：阿塔/);
  assert.equal(result.messages[1].content, '第一轮提问');
  assert.equal(result.messages[2].content, '第一轮回答');
  assert.equal(result.messages[3].content, '全局后置：阿塔\n\n世界后置\n\n角色后置');
  assert.equal(result.messages[4].content, '第二轮提问');
});
