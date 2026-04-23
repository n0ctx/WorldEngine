import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, writeUploadFile } from '../helpers/test-env.js';
import {
  insertCharacter,
  insertCharacterStateField,
  insertCharacterStateValue,
  insertMessage,
  insertPersona,
  insertPersonaStateField,
  insertPersonaStateValue,
  insertSession,
  insertTurnRecord,
  insertWorld,
  insertWorldEntry,
  insertWorldStateField,
  insertWorldStateValue,
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
    position: 'system',
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
  assert.equal(result.messages.length, 4);
  assert.match(result.messages[0].content, /全局系统：群星海/);
  assert.match(result.messages[0].content, /玩家身份：旅者/);
  assert.match(result.messages[0].content, /世界知识：群星海/);
  assert.match(result.messages[0].content, /全局后置：阿塔/);
  assert.match(result.messages[0].content, /角色后置/);
  assert.equal(result.messages[1].content, '第一轮提问');
  assert.equal(result.messages[2].content, '第一轮回答');
  assert.equal(result.messages[3].content, '第二轮提问');
});

test('buildPrompt 在开启状态栏、召回展开、日记注入与 suggestion 时注入完整矩阵', async () => {
  sandbox.writeConfig({
    ...sandbox.readConfig(),
    global_system_prompt: '全局系统：{{world}}',
    global_post_prompt: '全局后置：{{char}}',
    context_history_rounds: 1,
    suggestion_enabled: true,
  });

  const world = insertWorld(sandbox.db, { name: '矩阵世界' });
  insertPersona(sandbox.db, world.id, { name: '旅者', system_prompt: '玩家设定：{{user}}' });
  insertWorldStateField(sandbox.db, world.id, { field_key: 'weather', label: '天气' });
  insertWorldStateValue(sandbox.db, world.id, { field_key: 'weather', default_value_json: '"晴"' });
  insertPersonaStateField(sandbox.db, world.id, { field_key: 'hp', label: '体力' });
  insertPersonaStateValue(sandbox.db, world.id, { field_key: 'hp', default_value_json: '80' });

  const character = insertCharacter(sandbox.db, world.id, {
    name: '阿塔',
    system_prompt: '角色设定：{{char}}',
    post_prompt: '角色后置',
  });
  insertCharacterStateField(sandbox.db, world.id, { field_key: 'mood', label: '心情' });
  insertCharacterStateValue(sandbox.db, character.id, { field_key: 'mood', default_value_json: '"平静"' });
  insertWorldEntry(sandbox.db, world.id, { title: '世界条目', content: '世界知识：{{world}}', keywords: ['第二轮'] });

  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '旧问题', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '旧回答', created_at: 2 });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '第二轮提问', created_at: 4 });

  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');
  const result = await buildPrompt(session.id, { diaryInjection: '昨天的日记摘要', onRecallEvent() {} });

  assert.equal(result.messages.length, 4);
  assert.equal(result.recallHitCount, 0);
  assert.match(result.messages[0].content, /天气/);
  assert.match(result.messages[0].content, /体力/);
  assert.match(result.messages[0].content, /心情/);
  assert.match(result.messages[0].content, /\[日记注入\]\n昨天的日记摘要/);
  assert.match(result.messages[0].content, /全局后置：阿塔/);
  assert.equal(result.messages[1].content, '旧问题');
  assert.equal(result.messages[2].content, '旧回答');
  assert.match(result.messages.at(-1).content, /第二轮提问/);
  assert.match(result.messages.at(-1).content, /next_prompt/i);
});

test('buildPrompt 在关闭 suggestion 时不会把 next prompt 指令拼到当前用户消息', async () => {
  sandbox.writeConfig({
    ...sandbox.readConfig(),
    global_system_prompt: '',
    context_history_rounds: 1,
    suggestion_enabled: false,
  });

  const world = insertWorld(sandbox.db, { name: '无建议世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '维恩' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '当前问题', created_at: 1 });

  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');
  const result = await buildPrompt(session.id);

  assert.equal(result.messages.at(-1).content, '当前问题');
  assert.doesNotMatch(result.messages.at(-1).content, /next_prompt/i);
});

test('buildPrompt position=system 条目注入到 messages[0]', async () => {
  sandbox.writeConfig({
    ...sandbox.readConfig(),
    global_system_prompt: '',
    global_post_prompt: '',
    context_history_rounds: 1,
    suggestion_enabled: false,
  });

  const world = insertWorld(sandbox.db, { name: '系统条目世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '测试角色' });
  insertWorldEntry(sandbox.db, world.id, {
    title: '系统条目',
    content: '系统内容',
    trigger_type: 'always',
    position: 'system',
  });
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '用户消息', created_at: 1 });

  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');
  const result = await buildPrompt(session.id);

  assert.match(result.messages[0].content, /系统内容/);
});

test('buildPrompt position=post 条目注入到 system 后置段', async () => {
  sandbox.writeConfig({
    ...sandbox.readConfig(),
    global_system_prompt: '',
    global_post_prompt: '',
    context_history_rounds: 1,
    suggestion_enabled: false,
  });

  // 给 world 和 character 加 system_prompt，确保 messages[0] 是 systemParts 消息
  const world = insertWorld(sandbox.db, { name: '后置条目世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '测试角色', system_prompt: '角色系统提示' });
  insertWorldEntry(sandbox.db, world.id, {
    title: '后置条目',
    content: '后置内容',
    trigger_type: 'always',
    position: 'post',
  });
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '用户消息', created_at: 1 });

  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');
  const result = await buildPrompt(session.id);

  assert.equal(result.messages.length, 2);
  assert.match(result.messages[0].content, /角色系统提示/);
  assert.match(result.messages[0].content, /后置内容/);
  assert.equal(result.messages.at(-1).content, '用户消息');
});

test('buildPrompt inject_prompt consumed 模式注入且递减 rounds_remaining', async () => {
  sandbox.writeConfig({
    ...sandbox.readConfig(),
    global_system_prompt: '',
    global_post_prompt: '',
    context_history_rounds: 1,
    suggestion_enabled: false,
  });

  const world = insertWorld(sandbox.db, { name: '触发器世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '测试角色' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '用户消息', created_at: 1 });

  const { createTrigger, insertTriggerAction } = await freshImport('backend/db/queries/triggers.js');
  const trigger = createTrigger({ world_id: world.id, name: '注入触发器', enabled: 1 });
  const action = insertTriggerAction(trigger.id, 'inject_prompt', {
    text: '触发注入文本',
    mode: 'consumed',
    rounds_remaining: 2,
    inject_rounds: 3,
  });

  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');
  const result = await buildPrompt(session.id);

  assert.match(result.messages[0].content, /触发注入/);

  const row = sandbox.db.prepare('SELECT params FROM trigger_actions WHERE id = ?').get(action.id);
  const params = JSON.parse(row.params);
  assert.equal(params.rounds_remaining, 1);
});

test('buildPrompt inject_prompt rounds_remaining=0 时不再注入', async () => {
  sandbox.writeConfig({
    ...sandbox.readConfig(),
    global_system_prompt: '',
    global_post_prompt: '',
    context_history_rounds: 1,
    suggestion_enabled: false,
  });

  const world = insertWorld(sandbox.db, { name: '耗尽触发器世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '测试角色' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '用户消息', created_at: 1 });

  const { createTrigger, insertTriggerAction } = await freshImport('backend/db/queries/triggers.js');
  const trigger = createTrigger({ world_id: world.id, name: '耗尽触发器', enabled: 1 });
  insertTriggerAction(trigger.id, 'inject_prompt', {
    text: '触发注入文本',
    mode: 'consumed',
    rounds_remaining: 0,
    inject_rounds: 3,
  });

  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');
  const result = await buildPrompt(session.id);

  assert.equal(result.messages.length, 1);
  assert.doesNotMatch(result.messages.at(-1).content, /触发注入/);
});

test('buildWritingPrompt 在写作模式下合并多角色条目、状态与写作专属开关', async () => {
  sandbox.writeConfig({
    ...sandbox.readConfig(),
    global_system_prompt: '聊天全局系统',
    suggestion_enabled: false,
    writing: {
      ...sandbox.readConfig().writing,
      global_system_prompt: '写作系统：{{world}} / {{char}}',
      global_post_prompt: '写作后置：{{char}}',
      context_history_rounds: 1,
      suggestion_enabled: true,
      memory_expansion_enabled: true,
      llm: {
        model: 'writer-model',
        temperature: 0.95,
        max_tokens: 777,
      },
      temperature: 0.95,
      max_tokens: 777,
      model: 'writer-model',
    },
  });

  const world = insertWorld(sandbox.db, { name: '群像世界' });
  insertPersona(sandbox.db, world.id, { name: '旁观者', system_prompt: '玩家设定：{{user}}' });
  insertWorldEntry(sandbox.db, world.id, { title: '世界条目', content: '世界知识：{{world}}', keywords: ['当前场景'] });
  insertCharacterStateField(sandbox.db, world.id, { field_key: 'mood', label: '心情' });

  const alpha = insertCharacter(sandbox.db, world.id, { name: '阿尔法', system_prompt: '角色一：{{char}}' });
  const beta = insertCharacter(sandbox.db, world.id, { name: '贝塔', system_prompt: '角色二：{{char}}' });
  insertCharacterStateValue(sandbox.db, alpha.id, { field_key: 'mood', default_value_json: '"冷静"' });
  insertCharacterStateValue(sandbox.db, beta.id, { field_key: 'mood', default_value_json: '"紧张"' });
  const session = insertSession(sandbox.db, { world_id: world.id, mode: 'writing' });
  sandbox.db.prepare(`
    INSERT INTO writing_session_characters (id, session_id, character_id, created_at)
    VALUES ('w1', ?, ?, 1), ('w2', ?, ?, 2)
  `).run(session.id, alpha.id, session.id, beta.id);
  insertMessage(sandbox.db, session.id, { role: 'user', content: '当前场景', created_at: 10 });

  const { buildWritingPrompt } = await freshImport('backend/prompts/assembler.js');
  const result = await buildWritingPrompt(session.id);

  assert.equal(result.temperature, 0.95);
  assert.equal(result.maxTokens, 777);
  assert.equal(result.model, 'writer-model');
  assert.equal(result.messages.length, 2);
  assert.match(result.messages[0].content, /写作系统：群像世界 \/ 阿尔法/);
  assert.match(result.messages[0].content, /角色一：阿尔法/);
  assert.match(result.messages[0].content, /角色二：贝塔/);
  assert.match(result.messages[0].content, /写作后置：阿尔法/);
  assert.match(result.messages[0].content, /世界知识：群像世界/);
  assert.match(result.messages.at(-1).content, /当前场景/);
  assert.match(result.messages.at(-1).content, /next_prompt/i);
});
