import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../../backend/tests/helpers/test-env.js';
import { insertWorld, insertWorldEntry } from '../../backend/tests/helpers/fixtures.js';

const sandbox = createTestSandbox('assistant-agent');
sandbox.setEnv();

const taskStore = await freshImport('assistant/server/task-store.js');
const { runAgent, buildHistory, buildModelMessages, buildSystemPrompt } = await freshImport('assistant/server/agent.js');
const { DEFAULT_CONTEXT_LIMIT } = await freshImport('backend/services/model-context-limit.js');

// 约 10 万 token 的一段历史：超过默认上限的 80%
const OVER_THRESHOLD_TEXT = '海'.repeat(130_000);
const SUMMARY_REPLY = '<analysis>梳理过程</analysis>\n<summary>\n1. 用户的请求与意图：续写港口设定\n</summary>';

afterEach(() => resetMockEnv());
after(() => sandbox.cleanup());

test('一轮内调用工具落库，最终文字回复即完成', async () => {
  const world = insertWorld(sandbox.db, { name: 'agent-world' });
  const task = taskStore.createTask({ context: { worldId: world.id } });
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    { name: 'create', arguments: { kind: 'entry', data: { title: '潮汐钟', content: '满月时自鸣。' } } },
    { name: 'update', arguments: { ref: 'entry:not-exist', data: { title: 'x' } } },
  ]);
  process.env.MOCK_LLM_COMPLETE = '已添加条目「潮汐钟」。';

  await runAgent(task, '加一条潮汐钟的设定', { userMessageId: 'u1' });

  assert.equal(task.status, 'completed');
  const row = sandbox.db.prepare('SELECT content FROM world_prompt_entries WHERE world_id = ? AND title = ?').get(world.id, '潮汐钟');
  assert.equal(row.content, '满月时自鸣。');
  const tools = task.messages.filter((m) => m.role === 'tool_call');
  assert.deepEqual(tools.map((m) => [m.toolName, m.status]), [['create', 'done'], ['update', 'error']]);
  assert.match(tools[1].error, /不存在/);
  assert.equal(task.messages.at(-1).role, 'assistant');
  assert.equal(task.messages.at(-1).content, '已添加条目「潮汐钟」。');
});

test('模型没有回复时任务失败并给出原因', async () => {
  const task = taskStore.createTask({ context: {} });
  process.env.MOCK_LLM_COMPLETE = '';
  await runAgent(task, '你好');
  assert.equal(task.status, 'failed');
  assert.match(task.error, /没有返回回复/);
});

test('provider 报错时任务失败，用户可直接再发消息继续', async () => {
  const task = taskStore.createTask({ context: {} });
  process.env.MOCK_LLM_COMPLETE_ERROR = 'provider exploded';
  await runAgent(task, '你好');
  assert.equal(task.status, 'failed');
  assert.match(task.error, /provider exploded/);

  delete process.env.MOCK_LLM_COMPLETE_ERROR;
  process.env.MOCK_LLM_COMPLETE = '好的';
  await runAgent(task, '再试一次');
  assert.equal(task.status, 'completed');
});

test('已取消的任务不再执行', async () => {
  const task = taskStore.createTask({ context: {} });
  taskStore.setStatus(task.id, 'cancelled');
  await runAgent(task, '你好');
  assert.equal(task.status, 'cancelled');
  assert.equal(task.messages.length, 0);
});

test('buildHistory：工具调用折成系统附注放进下一条 user 消息，助手回复里不含操作记录', () => {
  const history = buildHistory([
    { id: 'u1', role: 'user', content: '建世界' },
    { id: 'c1', role: 'tool_call', toolName: 'create', summary: 'world 雾港', status: 'done' },
    { id: 'c2', role: 'tool_call', toolName: 'update', summary: 'entry:e1', status: 'error', error: '条目不存在' },
    { id: 'a1', role: 'assistant', content: '建好了' },
    { id: 'u2', role: 'user', content: '再加角色' },
    { id: 'c3', role: 'tool_call', toolName: 'create', summary: 'character 沈渡', status: 'running' },
    { id: 'u3', role: 'user', content: '继续' },
  ]);
  assert.deepEqual(history.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.equal(history[1].content, '建好了');
  assert.match(history[2].content, /^（系统附注[\s\S]*- create world 雾港 ✓[\s\S]*- update entry:e1 ✗ 条目不存在[\s\S]*再加角色/);
  assert.doesNotMatch(history[2].content.split('再加角色')[0], /该轮未给出回复/);
  assert.match(history[2].content, /create character 沈渡 （中断）\n（该轮未给出回复）[\s\S]*继续$/);
  assert.equal(history[2].id, 'u3');
});

test('buildSystemPrompt 附带参考文档清单与当前位置', async () => {
  const world = insertWorld(sandbox.db, { name: '雾港' });
  const prompt = await buildSystemPrompt({ worldId: world.id, characterId: null });
  assert.match(prompt, /doc:world/);
  assert.match(prompt, /doc:world-setting — 世界设定写法/);
  assert.match(prompt, /doc:prompt — 指令类文本写法/);
  assert.match(prompt, /doc:theme-tokens/);
  assert.match(prompt, new RegExp(`当前世界：world:${world.id}（雾港）`));
  const empty = await buildSystemPrompt({ worldId: null, characterId: null });
  assert.match(empty, /当前未选中世界/);
});

test('上一轮新建的世界在下一轮仍是当前世界，操作记录带上新资源 ref', async () => {
  const task = taskStore.createTask({ context: {} });
  process.env.MOCK_LLM_TOOL_CALLS_QUEUE = JSON.stringify([
    [{ name: 'create', arguments: { kind: 'world', data: { name: '跨轮世界', profile: { 时间: '1024-03-05' } } } }],
    [{ name: 'create', arguments: { kind: 'entry', data: { title: '港口', content: '雾很大。' } } }],
  ]);
  process.env.MOCK_LLM_COMPLETE = '好了';

  await runAgent(task, '建一个世界');
  const createWorld = task.messages.find((m) => m.role === 'tool_call' && m.target === 'world');
  const worldId = /world:([\w-]+)/.exec(createWorld.result)[1];
  assert.match(buildHistory(task.messages).at(-1).content, new RegExp(`已创建 world:${worldId}`));

  await runAgent(task, '加一条港口设定');
  assert.equal(task.status, 'completed');
  const entry = sandbox.db.prepare('SELECT world_id FROM world_prompt_entries WHERE title = ?').get('港口');
  assert.equal(entry.world_id, worldId);
});

test('取消会中断进行中的模型请求，不留下回复', async () => {
  const task = taskStore.createTask({ context: {} });
  process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify([{ text: '不该出现的回复', delayMs: 5000 }]);
  const running = runAgent(task, '你好');
  await new Promise((resolve) => setTimeout(resolve, 20));
  const startedAt = Date.now();
  taskStore.setStatus(task.id, 'cancelled');
  await running;
  assert.ok(Date.now() - startedAt < 1000, '取消后应立即返回，而不是等模型请求结束');
  assert.equal(task.status, 'cancelled');
  assert.equal(task.messages.some((m) => m.role === 'assistant'), false);
});

function readStoredMessages(taskId) {
  const row = sandbox.db.prepare('SELECT messages_json FROM assistant_tasks WHERE id = ?').get(taskId);
  return JSON.parse(row.messages_json);
}

// 订阅任务 SSE，每收到一段 DELTA 就回调一次
function onDelta(taskId, fn) {
  taskStore.attachSse(taskId, {
    write(frame) {
      const evt = JSON.parse(frame.slice('data: '.length));
      if (evt.type === 'delta') fn(evt);
      return true;
    },
  });
}

test('回复推送途中库里已是完整回复：此时进程退出，重启后回复不丢', async () => {
  const task = taskStore.createTask({ context: {} });
  const reply = '雾港'.repeat(60);
  process.env.MOCK_LLM_COMPLETE = reply;
  let storedAtFirstDelta = null;
  onDelta(task.id, (evt) => {
    storedAtFirstDelta ??= readStoredMessages(task.id).find((m) => m.id === evt.messageId)?.content;
  });
  await runAgent(task, '你好');
  assert.equal(storedAtFirstDelta, reply);
  assert.equal(task.messages.at(-1).content, reply);
});

test('回复推送途中取消：只留已推给面板的部分', async () => {
  const task = taskStore.createTask({ context: {} });
  process.env.MOCK_LLM_COMPLETE = '潮'.repeat(200);
  let shown = '';
  onDelta(task.id, (evt) => {
    shown += evt.delta;
    taskStore.setStatus(task.id, 'cancelled');
  });
  await runAgent(task, '你好');
  const reply = readStoredMessages(task.id).find((m) => m.role === 'assistant');
  assert.ok(shown.length > 0 && shown.length < 200);
  assert.equal(reply.content, shown);
});

test('批量工具调用：一轮建世界，下一轮一次建字段与条目，记录里带汇总摘要与涉及的资源类型', async () => {
  const task = taskStore.createTask({ context: {} });
  process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify([
    [{ name: 'create', arguments: { kind: 'world', data: { name: 'batch-agent-world', profile: { 时间: '1024-03-05' } } } }],
    [{ name: 'create', arguments: { items: [
      { kind: 'entry', data: { title: '重伤反应', content: '语气变得急促。', conditions: [{ field: '玩家.生命', op: '<', value: 30 }] } },
      { kind: 'field', data: { target: 'persona', label: '生命', type: 'number' } },
    ] } }],
    [{ name: 'create', arguments: { items: [{ kind: 'entry', data: { title: '缺正文' } }, { kind: 'entry', data: { title: '合格', content: '正文' } }] } }],
    { text: '世界已建好。' },
  ]);

  await runAgent(task, '建一个世界');

  assert.equal(task.status, 'completed');
  const calls = task.messages.filter((m) => m.role === 'tool_call');
  assert.deepEqual(calls.map((m) => [m.summary, m.status]), [
    ['world batch-agent-world', 'done'], ['entry×1 field×1', 'done'], ['entry×2', 'error'],
  ]);
  assert.deepEqual(calls[1].targets, ['entry', 'field']);
  assert.match(calls[1].result, /^已创建 2 项：entry:[\w-]+（重伤反应，trigger=state）；field:persona\.\w+（生命）$/);
  assert.match(calls[2].error, /^整批未写入（共 2 项，1 项有问题）：第 1 项 entry「缺正文」：缺少 content$/);

  const world = sandbox.db.prepare('SELECT id FROM worlds WHERE name = ?').get('batch-agent-world');
  const titles = sandbox.db.prepare('SELECT title FROM world_prompt_entries WHERE world_id = ?').all(world.id).map((r) => r.title);
  assert.deepEqual(titles, ['重伤反应']);
  assert.match(buildHistory(task.messages).at(-1).content, /- create entry×1 field×1 ✓ 已创建 2 项：/);
});

test('占用低于阈值时不压缩，只记录占用', async () => {
  const task = taskStore.createTask({ context: {} });
  process.env.MOCK_LLM_COMPLETE = '好的';
  await runAgent(task, '你好');
  assert.equal(task.status, 'completed');
  assert.equal(task.contextUsage.limit, DEFAULT_CONTEXT_LIMIT);
  assert.ok(task.contextUsage.tokens > 0 && task.contextUsage.tokens < DEFAULT_CONTEXT_LIMIT * 0.8);
  assert.equal(task.modelContext ?? null, null);
  assert.equal(task.messages.some((m) => m.role === 'compaction'), false);
});

test('任务开始时占用超过 80%：先压缩成摘要再继续，下一轮只回放压缩之后的消息', async () => {
  const task = taskStore.createTask({ context: {} });
  taskStore.appendMessage(task.id, { id: 'u0', role: 'user', content: OVER_THRESHOLD_TEXT });
  taskStore.appendMessage(task.id, { id: 'a0', role: 'assistant', content: '已记下。' });
  process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify(['继续完成了。']);
  process.env.MOCK_LLM_COMPLETE = SUMMARY_REPLY;

  await runAgent(task, '接着写', { userMessageId: 'u1' });

  assert.equal(task.status, 'completed');
  assert.equal(task.messages.at(-1).content, '继续完成了。');
  const marker = task.messages.find((m) => m.role === 'compaction');
  assert.ok(marker.tokensBefore >= DEFAULT_CONTEXT_LIMIT * 0.8);
  assert.ok(marker.tokensAfter < marker.tokensBefore / 10);
  assert.deepEqual(task.modelContext, { summary: '1. 用户的请求与意图：续写港口设定', untilId: marker.id });
  assert.equal(task.contextUsage.tokens, marker.tokensAfter);

  const next = buildModelMessages('SYSTEM', task, false);
  assert.match(next[0].content, /^SYSTEM\n\n# 更早对话的摘要\n1\. 用户的请求与意图/);
  assert.equal(next.some((m) => m.content.includes('海海海')), false);
  assert.deepEqual(next.slice(1).map((m) => m.role), ['user', 'assistant']);
  assert.equal(next.at(-1).content, '继续完成了。');
});

test('工具调用途中占用超过 80%：压缩后接着完成，压缩记录排在已执行的工具之后', async () => {
  const world = insertWorld(sandbox.db, { name: 'compact-world' });
  const entry = insertWorldEntry(sandbox.db, world.id, { title: '长条目', content: '潮'.repeat(40_000) });
  const task = taskStore.createTask({ context: { worldId: world.id } });
  const reads = Array.from({ length: 6 }, () => ({ name: 'read', arguments: { ref: `entry:${entry.id}` } }));
  process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify([reads, '读完并整理好了。']);
  process.env.MOCK_LLM_COMPLETE = SUMMARY_REPLY;

  await runAgent(task, '把长条目读几遍', { userMessageId: 'u1' });

  assert.equal(task.status, 'completed');
  assert.deepEqual(
    task.messages.map((m) => m.role),
    ['user', ...reads.map(() => 'tool_call'), 'compaction', 'assistant'],
  );
  assert.equal(task.modelContext.untilId, task.messages.find((m) => m.role === 'compaction').id);
  assert.equal(task.messages.at(-1).content, '读完并整理好了。');
});

test('压缩请求失败时任务失败并说明原因，不带着超限的上下文继续', async () => {
  const task = taskStore.createTask({ context: {} });
  taskStore.appendMessage(task.id, { id: 'u0', role: 'user', content: OVER_THRESHOLD_TEXT });
  taskStore.appendMessage(task.id, { id: 'a0', role: 'assistant', content: '已记下。' });
  process.env.MOCK_LLM_COMPLETE_ERROR = 'summary exploded';

  await runAgent(task, '接着写');

  assert.equal(task.status, 'failed');
  assert.match(task.error, /^上下文压缩失败：.*summary exploded/);
  assert.equal(task.modelContext ?? null, null);
  assert.equal(task.messages.some((m) => m.role === 'compaction'), false);
});

test('压缩期间取消任务：立即停止，不留下摘要', async () => {
  const task = taskStore.createTask({ context: {} });
  taskStore.appendMessage(task.id, { id: 'u0', role: 'user', content: OVER_THRESHOLD_TEXT });
  taskStore.appendMessage(task.id, { id: 'a0', role: 'assistant', content: '已记下。' });
  process.env.MOCK_LLM_COMPLETE = SUMMARY_REPLY;
  process.env.MOCK_LLM_COMPLETE_DELAY_MS = '5000';

  const running = runAgent(task, '接着写');
  await new Promise((resolve) => setTimeout(resolve, 50));
  const startedAt = Date.now();
  taskStore.setStatus(task.id, 'cancelled');
  await running;

  assert.ok(Date.now() - startedAt < 2500, '取消后不应等完压缩请求的 5 秒延时');
  assert.equal(task.status, 'cancelled');
  assert.equal(task.modelContext ?? null, null);
  assert.equal(task.messages.some((m) => m.role === 'compaction'), false);
});

test('buildModelMessages：压缩标记被截掉后摘要作废，回放全部消息', () => {
  const task = taskStore.createTask({ context: {} });
  taskStore.appendMessage(task.id, { id: 'u1', role: 'user', content: '第一句' });
  taskStore.setModelContext(task.id, { summary: '旧摘要', untilId: 'gone' });

  const messages = buildModelMessages('SYSTEM', task, false);

  assert.deepEqual(messages, [{ role: 'system', content: 'SYSTEM' }, { role: 'user', content: '第一句' }]);
  assert.equal(task.modelContext, null);
});

test('steer：工具循环运行期间排队的用户消息在下次迭代前注入模型输入', async () => {
  const world = insertWorld(sandbox.db, { name: 'steer-world' });
  const task = taskStore.createTask({ context: { worldId: world.id } });

  // 第一轮：创建一个条目（带延迟，以便测试有时间在第二次迭代前排队 steer）
  process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify([
    { calls: [{ name: 'create', arguments: { kind: 'entry', data: { title: '初始设定', content: '初始内容' } } }], delayMs: 1500 },
    { text: '已按用户指令调整为星际帝国设定。' }
  ]);

  const running = runAgent(task, '创建一个世界设定');
  // 等第一个工具调用执行完、第二次迭代开始前的窗口期排队 steer 消息
  await new Promise((r) => setTimeout(r, 800));
  taskStore.queueUserMessage(task.id, '背景改成星际帝国');

  await running;
  assert.equal(task.status, 'completed');
  assert.ok(task.messages.some((m) => m.content === '背景改成星际帝国'), 'steer 消息应出现在任务历史中');
});

test('steer：多次迭代期间连续排队多条 steer 消息按顺序处理', async () => {
  const world = insertWorld(sandbox.db, { name: 'steer-multi-world' });
  const task = taskStore.createTask({ context: { worldId: world.id } });

  process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify([
    { calls: [{ name: 'create', arguments: { kind: 'entry', data: { title: '第一条', content: '内容' } } }], delayMs: 300 },
    { calls: [{ name: 'create', arguments: { kind: 'entry', data: { title: '第二条', content: '内容' } } }], delayMs: 300 },
    { text: '已完成全部设定。' }
  ]);

  const running = runAgent(task, '创建世界设定');
  await new Promise((r) => setTimeout(r, 350));
  taskStore.queueUserMessage(task.id, 'steer-1');
  taskStore.queueUserMessage(task.id, 'steer-2');

  await running;
  assert.equal(task.status, 'completed');
  const steerMsgs = task.messages.filter((m) => m.content === 'steer-1' || m.content === 'steer-2');
  assert.equal(steerMsgs.length, 2);
});

test('steer：工具执行中途到达的 steer 消息等待下一次迭代才生效', async () => {
  const world = insertWorld(sandbox.db, { name: 'steer-mid-tool-world' });
  const task = taskStore.createTask({ context: { worldId: world.id } });

  // 长耗时工具调用（1000ms），在其执行中途排队 steer，应等工具完成后下一次迭代才生效
  process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify([
    { calls: [{ name: 'create', arguments: { kind: 'entry', data: { title: '设定', content: '内容' } } }], delayMs: 1000 },
    { text: '完成。' }
  ]);

  const running = runAgent(task, '创建世界设定');
  // 在工具执行中途排队 steer
  await new Promise((r) => setTimeout(r, 400));
  taskStore.queueUserMessage(task.id, '中间插一句');

  await running;
  assert.equal(task.status, 'completed');
  assert.ok(task.messages.some((m) => m.content === '中间插一句'), 'steer 消息应出现在历史中');
  // steer 在工具执行中途排队，但它应该在同一个迭代周期内被处理（因为工具完成后 immediately before next turn）
  const steerIndex = task.messages.findIndex((m) => m.content === '中间插一句');
  const toolIndex = task.messages.findIndex((m) => m.role === 'tool_call' && m.summary.includes('设定'));
  assert.ok(steerIndex > toolIndex, 'steer 消息应出现在工具调用之后');
});

test('steer：排队空字符串作为 steer 消息不应影响执行', async () => {
  const world = insertWorld(sandbox.db, { name: 'steer-empty-world' });
  const task = taskStore.createTask({ context: { worldId: world.id } });

  process.env.MOCK_LLM_TOOL_TURNS_QUEUE = JSON.stringify([
    { calls: [{ name: 'create', arguments: { kind: 'entry', data: { title: '设定', content: '内容' } } }], delayMs: 300 },
    { text: '完成。' }
  ]);

  const running = runAgent(task, '创建世界设定');
  await new Promise((r) => setTimeout(r, 400));
  taskStore.queueUserMessage(task.id, '');
  taskStore.queueUserMessage(task.id, '');

  await running;
  assert.equal(task.status, 'completed');
});

test('buildModelMessages：标记之后以助手内容开头时先垫一条 user 说明', () => {
  const task = taskStore.createTask({ context: {} });
  taskStore.appendMessage(task.id, { id: 'u1', role: 'user', content: '被压缩的请求' });
  taskStore.appendMessage(task.id, { id: 'c1', role: 'compaction', tokensBefore: 99000, tokensAfter: 5000 });
  taskStore.appendMessage(task.id, { id: 't1', role: 'tool_call', toolName: 'create', summary: 'entry 港口', status: 'done', result: '已创建 entry:e1' });
  taskStore.appendMessage(task.id, { id: 'a1', role: 'assistant', content: '建好了。' });
  taskStore.appendMessage(task.id, { id: 'u2', role: 'user', content: '再加一条' });
  taskStore.setModelContext(task.id, { summary: '摘要', untilId: 'c1' });

  const messages = buildModelMessages('SYSTEM', task, false);

  assert.deepEqual(messages.map((m) => m.role), ['system', 'user', 'assistant', 'user']);
  assert.match(messages[1].content, /已压缩为系统提示词末尾的摘要/);
  assert.equal(messages[2].content, '建好了。');
  assert.match(messages[3].content, /系统附注[\s\S]*entry:e1[\s\S]*再加一条$/);
  assert.equal(messages.some((m) => m.content.includes('被压缩的请求')), false);
});
