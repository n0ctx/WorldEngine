import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv, writeUploadFile } from '../helpers/test-env.js';
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
import { countMessages } from '../../utils/token-counter.js';

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

test('sliceHistoryAfterRound keepLatestUser 控制是否摘除最后一条 user，coveredTo 有值时严格保留其后完整轮次', async () => {
  const { __testables } = await freshImport('backend/prompts/assembler.js');
  const msgs = [
    { role: 'user', content: 'u1' },
    { role: 'assistant', content: 'a1' },
    { role: 'user', content: 'u2' },
    { role: 'assistant', content: 'a2' },
    { role: 'user', content: 'u3' },
  ];
  // 默认（生成模式）：先摘掉最后一条 user（本轮新输入），round_index > 1 的完整轮次只剩第 2 轮
  assert.deepEqual(
    __testables.sliceHistoryAfterRound(msgs, 1).map((m) => m.content),
    ['u2', 'a2'],
  );
  // 续写模式 keepLatestUser=true：不摘除最后一条 user，第 3 轮（仅 u3）本身也 > coveredTo
  assert.deepEqual(
    __testables.sliceHistoryAfterRound(msgs, 1, { keepLatestUser: true }).map((m) => m.content),
    ['u2', 'a2', 'u3'],
  );
});

test('sliceHistoryAfterRound coveredTo 缺失（旧会话过渡）时按 token 预算从最新往最旧取完整轮次，至少保留最近一轮', async () => {
  const { __testables } = await freshImport('backend/prompts/assembler.js');
  const msgs = [
    { role: 'user', content: '甲'.repeat(400) },
    { role: 'assistant', content: '乙'.repeat(400) },
    { role: 'user', content: '第二轮短消息' },
    { role: 'assistant', content: '第二轮短回复' },
    { role: 'user', content: '当前输入' },
  ];
  const recentRoundBudget = countMessages([msgs[2], msgs[3]]);
  // 预算刚好放下最近一轮，放不下更早的第一轮
  assert.deepEqual(
    __testables.sliceHistoryAfterRound(msgs, null, { budget: recentRoundBudget }).map((m) => m.content),
    ['第二轮短消息', '第二轮短回复'],
  );
  // 预算小于最近一轮本身的 token 数时，仍至少保留最近一轮，不因超预算而清空历史
  assert.deepEqual(
    __testables.sliceHistoryAfterRound(msgs, null, { budget: 1 }).map((m) => m.content),
    ['第二轮短消息', '第二轮短回复'],
  );
});

test('buildPrompt 组装系统段、历史消息，本轮上下文 + 当前用户消息 + 后置提示词合为末尾 user', async () => {
  sandbox.writeConfig({
    ...sandbox.readConfig(),
    global_system_prompt: '全局系统：{{world}}',
    global_post_prompt: '全局后置：{{char}}',
    provider_keys: {},
    llm: {
      provider: 'mock',
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
  sandbox.db.prepare('UPDATE worlds SET sampling_json = ? WHERE id = ?').run('{"top_p":0.85}', world.id);
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
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '第一轮提问', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '<think>上一轮的思考</think>\n\n第一轮回答', created_at: 2 });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '第二轮提问', created_at: 3 });

  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');
  const result = await buildPrompt(session.id);

  assert.equal(result.temperature, 0.2);
  assert.equal(result.maxTokens, 120);
  assert.deepEqual(result.sampling, { top_p: 0.85 });
  assert.equal(result.recallHitCount, 0);
  assert.equal(result.messages.length, 4);
  assert.match(result.messages[0].content, /全局系统：群星海/);
  assert.match(result.messages[0].content, /玩家身份：旅者/);
  assert.match(result.messages[0].content, /角色设定：阿塔/);
  assert.doesNotMatch(result.messages[0].content, /世界知识/);
  assert.equal(result.messages[0].content, result.cacheableSystem);
  assert.equal(result.messages[1].content, '第一轮提问');
  assert.equal(result.messages[2].content, '第一轮回答');
  assert.equal(result.messages.at(-1).role, 'user');
  // 本轮上下文在前，用户消息居中，后置提示词在后
  assert.match(result.messages.at(-1).content, /^<world_entries>[\s\S]*世界知识：群星海[\s\S]*第二轮提问[\s\S]*全局后置：阿塔[\s\S]*角色后置/);
  assert.match(result.turnContext, /世界知识：群星海/);
});

test('buildPrompt 在开启状态栏、召回展开、日记注入与 suggestion 时注入完整矩阵', async () => {
  sandbox.writeConfig({
    ...sandbox.readConfig(),
    global_system_prompt: '全局系统：{{world}}',
    global_post_prompt: '全局后置：{{char}}',
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
  assert.doesNotMatch(result.messages[0].content, /天气|体力|心情|<diary>/);
  assert.match(result.messages.at(-1).content, /天气/);
  assert.match(result.messages.at(-1).content, /体力/);
  assert.match(result.messages.at(-1).content, /心情/);
  assert.match(result.messages.at(-1).content, /<diary>\n昨天的日记摘要[\s\S]*第二轮提问/);
  assert.equal(result.messages[1].content, '旧问题');
  assert.equal(result.messages[2].content, '旧回答');
  assert.equal(result.messages.at(-1).role, 'user');
  assert.match(result.messages.at(-1).content, /第二轮提问/);
  assert.match(result.messages.at(-1).content, /全局后置：阿塔/);
  assert.match(result.messages.at(-1).content, /next_prompt/i);
});

test('buildPrompt 在关闭 suggestion 时不会把 next prompt 指令拼到当前用户消息', async () => {
  sandbox.writeConfig({
    ...sandbox.readConfig(),
    global_system_prompt: '',
    global_post_prompt: '',
    suggestion_enabled: false,
  });

  const world = insertWorld(sandbox.db, { name: '无建议世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '维恩' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '当前问题', created_at: 1 });

  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');
  const result = await buildPrompt(session.id);

  assert.match(result.messages.at(-1).content, /当前问题/);
  assert.doesNotMatch(result.messages.at(-1).content, /next_prompt/i);
});

function insertOptionRounds(session) {
  const setOptions = (message, options) => sandbox.db
    .prepare('UPDATE messages SET next_options = ? WHERE id = ?')
    .run(JSON.stringify(options), message.id);
  insertMessage(sandbox.db, session.id, { role: 'user', content: '开始', created_at: 1 });
  setOptions(insertMessage(sandbox.db, session.id, { role: 'assistant', content: '公会大厅', created_at: 2 }), ['接讨伐任务', '接探索任务']);
  insertMessage(sandbox.db, session.id, { role: 'user', content: '接探索任务', created_at: 3 });
  setOptions(insertMessage(sandbox.db, session.id, { role: 'assistant', content: '接待员交代路线', created_at: 4 }), ['出北门', '问编号']);
  insertMessage(sandbox.db, session.id, { role: 'user', content: '先去买火把', created_at: 5 });
}

test('buildPrompt 开启选项时历史回复带回当轮选项，并按玩家下一条消息标上已选或未选', async () => {
  sandbox.writeConfig({ ...sandbox.readConfig(), global_system_prompt: '', global_post_prompt: '', suggestion_enabled: true });
  const world = insertWorld(sandbox.db, { name: '选项历史世界' });
  const session = insertSession(sandbox.db, { character_id: insertCharacter(sandbox.db, world.id).id });
  insertOptionRounds(session);

  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');
  const { messages } = await buildPrompt(session.id);
  const history = messages.filter((msg) => msg.role !== 'system');

  assert.equal(history[1].content, '公会大厅\n\n<next_prompt>\n（未选）接讨伐任务\n（已选）接探索任务\n</next_prompt>');
  assert.equal(history[2].content, '接探索任务');
  // 玩家自行输入：选项全部未选
  assert.equal(history[3].content, '接待员交代路线\n\n<next_prompt>\n（未选）出北门\n（未选）问编号\n</next_prompt>');
  assert.match(history.at(-1).content, /^<user_input>\n先去买火把/);
});

test('buildPrompt 关闭选项时历史不带选项', async () => {
  sandbox.writeConfig({ ...sandbox.readConfig(), global_system_prompt: '', global_post_prompt: '', suggestion_enabled: false });
  const world = insertWorld(sandbox.db, { name: '无选项历史世界' });
  const session = insertSession(sandbox.db, { character_id: insertCharacter(sandbox.db, world.id).id });
  insertOptionRounds(session);

  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');
  const { messages } = await buildPrompt(session.id);
  const history = messages.filter((msg) => msg.role !== 'system');

  assert.equal(history[1].content, '公会大厅');
  assert.equal(history[2].content, '接探索任务');
  assert.match(history.at(-1).content, /^<user_input>\n先去买火把/);
});

test('buildPrompt 续写时被续写的回复不接旧选项', async () => {
  sandbox.writeConfig({ ...sandbox.readConfig(), global_system_prompt: '', global_post_prompt: '', suggestion_enabled: true });
  const world = insertWorld(sandbox.db, { name: '续写选项世界' });
  const session = insertSession(sandbox.db, { character_id: insertCharacter(sandbox.db, world.id).id });
  insertOptionRounds(session);
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '杂货铺', created_at: 6 });
  sandbox.db.prepare('UPDATE messages SET next_options = ? WHERE session_id = ? AND content = ?')
    .run(JSON.stringify(['买火把']), session.id, '杂货铺');

  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');
  const { messages } = await buildPrompt(session.id, { continuation: true });

  assert.equal(messages.at(-1).content, '杂货铺');
  assert.match(messages.at(-3).content, /<next_prompt>\n（未选）出北门\n（未选）问编号\n<\/next_prompt>$/);
});

test('buildPrompt always 条目注入本轮上下文', async () => {
  sandbox.writeConfig({
    ...sandbox.readConfig(),
    global_system_prompt: '',
    global_post_prompt: '',
    suggestion_enabled: false,
  });

  const world = insertWorld(sandbox.db, { name: '系统条目世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '测试角色' });
  insertWorldEntry(sandbox.db, world.id, {
    title: '系统条目',
    content: '系统内容',
    trigger_type: 'always',
  });
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '用户消息', created_at: 1 });

  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');
  const result = await buildPrompt(session.id);

  // 只剩标签说明的 system + 本轮 user
  assert.deepEqual(result.messages.map((m) => m.role), ['system', 'user']);
  assert.match(result.messages[0].content, /^<context_guide>/);
  assert.match(result.messages[1].content, /^<world_entries>[\s\S]*系统内容[\s\S]*<user_input>\n用户消息\n<\/user_input>\n\n（你正在扮演/);
});

test('buildPrompt 角色 system_prompt 注入 cached system，always 条目注入本轮上下文', async () => {
  sandbox.writeConfig({
    ...sandbox.readConfig(),
    global_system_prompt: '',
    global_post_prompt: '',
    suggestion_enabled: false,
  });

  const world = insertWorld(sandbox.db, { name: '后置条目世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '测试角色', system_prompt: '角色系统提示' });
  insertWorldEntry(sandbox.db, world.id, {
    title: '后置条目',
    content: '后置内容',
    trigger_type: 'always',
  });
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '用户消息', created_at: 1 });

  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');
  const result = await buildPrompt(session.id);

  assert.equal(result.messages.length, 2);
  assert.match(result.messages[0].content, /角色系统提示/);
  assert.doesNotMatch(result.messages[0].content, /后置内容/);
  assert.match(result.messages.at(-1).content, /后置内容[\s\S]*用户消息/);
  assert.match(result.messages.at(-1).content, /你正在扮演测试角色/);
});


test('buildWritingPrompt 写作模式不注入 [4] 角色 system_prompt 与 [7] 角色状态段', async () => {
  sandbox.writeConfig({
    ...sandbox.readConfig(),
    global_system_prompt: '聊天全局系统',
    suggestion_enabled: false,
    writing: {
      ...sandbox.readConfig().writing,
      global_system_prompt: '写作系统：{{world}} / {{char}}',
      global_post_prompt: '写作后置：{{char}}',
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
  // 即便世界里仍有公共角色卡，写作 prompt 也不应注入 char_info / char_state
  insertCharacterStateField(sandbox.db, world.id, { field_key: 'mood', label: '心情' });
  const alpha = insertCharacter(sandbox.db, world.id, { name: '阿尔法', system_prompt: '角色一：{{char}}' });
  insertCharacterStateValue(sandbox.db, alpha.id, { field_key: 'mood', default_value_json: '"冷静"' });
  const session = insertSession(sandbox.db, { world_id: world.id, mode: 'writing' });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '当前场景', created_at: 10 });

  const { buildWritingPrompt } = await freshImport('backend/prompts/assembler.js');
  const result = await buildWritingPrompt(session.id);

  assert.equal(result.temperature, 0.95);
  assert.equal(result.maxTokens, 577);
  assert.equal(result.model, 'writer-model');
  assert.equal(result.messages.length, 2);
  // 写作 system 段只含 [1][2][3]，触发条目进本轮上下文；不含角色 system_prompt 与 char_state
  // 写作模式无主角色概念，{{char}} 保留字面量交给 LLM 上下文判断（不再硬塞"叙述者"）
  assert.match(result.messages[0].content, /写作系统：群像世界 \/ \{\{char\}\}/);
  assert.doesNotMatch(result.messages[0].content, /世界知识/);
  for (const message of result.messages) {
    assert.doesNotMatch(message.content, /<char_info>/);
    assert.doesNotMatch(message.content, /<char_state/);
    assert.doesNotMatch(message.content, /角色一：阿尔法/);
  }
  assert.equal(result.messages.at(-1).role, 'user');
  assert.match(result.messages.at(-1).content, /世界知识：群像世界[\s\S]*当前场景[\s\S]*写作后置：\{\{char\}\}/);
  assert.match(result.messages.at(-1).content, /next_prompt/i);
});

test('buildPrompt coveredTo 有值时：历史只保留其后完整轮次，剧情摘要注入 <story_summary>，历史轮次目录不泄漏进主 prompt', async () => {
  sandbox.writeConfig({
    ...sandbox.readConfig(),
    global_system_prompt: '',
    global_post_prompt: '',
    suggestion_enabled: false,
    memory_expansion_enabled: true,
  });

  const world = insertWorld(sandbox.db, { name: '覆盖世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '覆盖角色' });
  const session = insertSession(sandbox.db, { character_id: character.id });

  const oldUser = insertMessage(sandbox.db, session.id, { role: 'user', content: '第一轮旧提问', created_at: 1 });
  const oldAsst = insertMessage(sandbox.db, session.id, { role: 'assistant', content: '第一轮旧回答', created_at: 2 });
  insertTurnRecord(sandbox.db, session.id, {
    id: 'turn-covered-1',
    round_index: 1,
    summary: '旧轮摘要正文',
    scene: '旧场景',
    cast_json: JSON.stringify(['旧角色']),
    user_message_id: oldUser.id,
    asst_message_id: oldAsst.id,
    created_at: 3,
  });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '第二轮新提问', created_at: 4 });
  const newAsst = insertMessage(sandbox.db, session.id, { role: 'assistant', content: '第二轮新回答', created_at: 5 });
  insertTurnRecord(sandbox.db, session.id, {
    id: 'turn-latest',
    round_index: 2,
    summary: '最近一轮摘要',
    user_message_id: null,
    asst_message_id: newAsst.id,
    middle_summary: '这是更早剧情的中期摘要正文',
    middle_covered_to: 1,
    created_at: 6,
  });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '第三轮当前提问', created_at: 7 });

  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify([JSON.stringify({ turns: [1] })]);
  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');
  const result = await buildPrompt(session.id, { onRecallEvent() {} });
  resetMockEnv();

  // [8.5] 剧情摘要留在 system
  assert.equal(result.messages[0].role, 'system');
  assert.match(result.messages[0].content, /<story_summary>[\s\S]*这是更早剧情的中期摘要正文[\s\S]*<\/story_summary>/);
  // [10] 长期召回原文命中第一轮原文，进本轮 user
  assert.doesNotMatch(result.messages[0].content, /<expanded_dialogues>/);
  assert.match(result.messages.at(-1).content, /<expanded_dialogues>[\s\S]*第一轮旧提问[\s\S]*第一轮旧回答[\s\S]*<\/expanded_dialogues>[\s\S]*第三轮当前提问/);
  assert.equal(result.recallHitCount, 1);
  // 只发给 aux 召回模型的「历史轮次目录」索引行不应出现在主 prompt 里
  for (const message of result.messages) {
    assert.doesNotMatch(message.content, /旧轮摘要正文/);
    assert.doesNotMatch(message.content, /旧场景/);
    assert.doesNotMatch(message.content, /历史轮次目录/);
  }
  // [12] 历史只含 round_index > coveredTo(1) 的完整轮次，不含第一轮
  assert.equal(result.messages[1].content, '第二轮新提问');
  assert.equal(result.messages[2].content, '第二轮新回答');
  assert.doesNotMatch(result.messages[1].content, /第一轮/);
});

test('buildPrompt 旧会话过渡（coveredTo 不可用）时按 short_term_token_budget 截断历史，只保留最近完整轮次', async () => {
  sandbox.writeConfig({
    ...sandbox.readConfig(),
    global_system_prompt: '',
    global_post_prompt: '',
    suggestion_enabled: false,
    short_term_token_budget: 1000,
  });

  const world = insertWorld(sandbox.db, { name: '过渡世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '过渡角色' });
  const session = insertSession(sandbox.db, { character_id: character.id });

  insertMessage(sandbox.db, session.id, { role: 'user', content: '甲'.repeat(3000), created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '乙'.repeat(3000), created_at: 2 });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '第二轮短提问', created_at: 3 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '第二轮短回答', created_at: 4 });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '当前提问', created_at: 5 });

  const { buildPrompt } = await freshImport('backend/prompts/assembler.js');
  const result = await buildPrompt(session.id);

  assert.equal(result.recallHitCount, 0);
  assert.equal(result.messages.length, 4);
  assert.equal(result.messages[0].role, 'system');
  assert.equal(result.messages[1].content, '第二轮短提问');
  assert.equal(result.messages[2].content, '第二轮短回答');
  assert.ok(result.messages.every((m) => !String(m.content).includes('甲')));
});
