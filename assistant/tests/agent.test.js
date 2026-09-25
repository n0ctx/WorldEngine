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
  assert.match(prompt, /doc:theme-tokens/);
  assert.match(prompt, new RegExp(`当前世界：world:${world.id}（雾港）`));
  const empty = await buildSystemPrompt({ worldId: null, characterId: null });
  assert.match(empty, /当前未选中世界/);
});

test('上一轮新建的世界在下一轮仍是当前世界，操作记录带上新资源 ref', async () => {
  const task = taskStore.createTask({ context: {} });
  process.env.MOCK_LLM_TOOL_CALLS_QUEUE = JSON.stringify([
    [{ name: 'create', arguments: { kind: 'world', data: { name: '跨轮世界' } } }],
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
