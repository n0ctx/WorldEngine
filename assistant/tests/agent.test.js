import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../../backend/tests/helpers/test-env.js';
import { insertWorld } from '../../backend/tests/helpers/fixtures.js';

const sandbox = createTestSandbox('assistant-agent');
sandbox.setEnv();

const taskStore = await freshImport('assistant/server/task-store.js');
const { runAgent, buildHistory, buildSystemPrompt } = await freshImport('assistant/server/agent.js');

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

test('buildHistory：工具调用折叠成操作记录，未回复的轮次也保留', () => {
  const history = buildHistory([
    { id: 'u1', role: 'user', content: '建世界' },
    { id: 'c1', role: 'tool_call', toolName: 'create', summary: 'world 雾港', status: 'done' },
    { id: 'c2', role: 'tool_call', toolName: 'update', summary: 'entry:e1', status: 'error', error: '条目不存在' },
    { id: 'a1', role: 'assistant', content: '建好了' },
    { id: 'u2', role: 'user', content: '再加角色' },
    { id: 'c3', role: 'tool_call', toolName: 'create', summary: 'character 沈渡', status: 'running' },
    { id: 'u3', role: 'user', content: '继续' },
  ]);
  assert.deepEqual(history.map((m) => m.role), ['user', 'assistant', 'user', 'assistant', 'user']);
  assert.match(history[1].content, /- create world 雾港 ✓/);
  assert.match(history[1].content, /- update entry:e1 ✗ 条目不存在/);
  assert.match(history[1].content, /建好了$/);
  assert.match(history[3].content, /create character 沈渡 （中断）/);
  assert.match(history[3].content, /该轮未给出回复/);
  assert.equal(history[3].id, 'c3');
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
  assert.match(buildHistory(task.messages)[1].content, new RegExp(`已创建 world:${worldId}`));

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
