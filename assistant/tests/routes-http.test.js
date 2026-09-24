import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from '../../backend/node_modules/express/index.js';

import { createTestSandbox, freshImport, resetMockEnv } from '../../backend/tests/helpers/test-env.js';

const sandbox = createTestSandbox('assistant-routes-http');
sandbox.setEnv();

const router = (await freshImport('assistant/server/routes.js')).default;
const taskStore = await freshImport('assistant/server/task-store.js');

const app = express();
app.use(express.json());
app.use('/api/assistant', router);
const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}/api/assistant`;

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  resetMockEnv();
  sandbox.cleanup();
});

async function postJSON(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, json: ct.includes('application/json') ? await res.json() : null, text: !ct.includes('application/json') ? await res.text() : null };
}

async function getJSON(path) {
  const res = await fetch(`${base}${path}`);
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, json: ct.includes('application/json') ? await res.json() : null };
}

async function postSSE(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.body) return { status: res.status, events: [] };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop();
    for (const p of parts) {
      const line = p.replace(/^data: /, '').trim();
      if (!line) continue;
      try { events.push(JSON.parse(line)); } catch { /* skip */ }
    }
    // 早停：见到 done:true 就退出
    if (events.some((e) => e.done)) break;
  }
  return { status: res.status, events };
}

test('GET /agent/:taskId 404 / 200', async () => {
  const r404 = await getJSON('/agent/no-such');
  assert.equal(r404.status, 404);

  const t = taskStore.createTask({ context: {} });
  const r = await getJSON(`/agent/${t.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.json.task.id, t.id);
});

test('GET /agent/recover 返回最近可恢复任务', async () => {
  const oldTask = taskStore.createTask({ context: { worldId: 'old' } });
  taskStore.setStatus(oldTask.id, 'running');
  oldTask.updatedAt = Date.now() - 60_000;

  const latestTask = taskStore.createTask({ context: { worldId: 'latest' } });
  taskStore.setStatus(latestTask.id, 'failed', { error: taskStore.__testables.RESTART_INTERRUPTED_ERROR });

  const r = await getJSON('/agent/recover');
  assert.equal(r.status, 200);
  assert.equal(r.json.task.id, latestTask.id);
});

test('POST /agent/:taskId/cancel 切换状态', async () => {
  const t = taskStore.createTask({ context: {} });
  const r = await postJSON(`/agent/${t.id}/cancel`, {});
  assert.equal(r.status, 200);
  assert.equal(t.status, 'cancelled');

  const r404 = await postJSON('/agent/no-such/cancel', {});
  assert.equal(r404.status, 404);
});

test('POST /agent/:taskId/cancel 对终态任务为 no-op', async () => {
  const t = taskStore.createTask({ context: {} });
  t.status = 'completed';

  const r = await postJSON(`/agent/${t.id}/cancel`, {});
  assert.equal(r.status, 200);
  assert.equal(r.json.ignored, true);
  assert.equal(t.status, 'completed');
});

test('POST /agent/:taskId/truncate 与 /delete 边界', async () => {
  const t = taskStore.createTask({ context: {} });
  taskStore.appendMessage(t.id, { id: 'm1', role: 'user', content: 'a' });
  taskStore.appendMessage(t.id, { id: 'm2', role: 'assistant', content: 'b' });
  // truncate 不存在
  const tr404 = await postJSON(`/agent/${t.id}/truncate`, { messageId: 'nope' });
  assert.equal(tr404.status, 404);
  // truncate ok
  const tr = await postJSON(`/agent/${t.id}/truncate`, { messageId: 'm2' });
  assert.equal(tr.status, 200);
  assert.equal(tr.json.messages.length, 1);
  // delete 不存在
  const d404 = await postJSON(`/agent/${t.id}/delete`, { messageId: 'nope' });
  assert.equal(d404.status, 404);
  // delete ok
  const dok = await postJSON(`/agent/${t.id}/delete`, { messageId: 'm1' });
  assert.equal(dok.status, 200);
  assert.equal(dok.json.messages.length, 0);

  // running 状态拒绝 truncate 与 delete
  taskStore.setStatus(t.id, 'running');
  const tr400 = await postJSON(`/agent/${t.id}/truncate`, { messageId: 'm1' });
  assert.equal(tr400.status, 400);
  const d400 = await postJSON(`/agent/${t.id}/delete`, { messageId: 'm1' });
  assert.equal(d400.status, 400);

  // 不存在的 task
  const e1 = await postJSON('/agent/nope/truncate', { messageId: 'x' });
  assert.equal(e1.status, 404);
  const e2 = await postJSON('/agent/nope/delete', { messageId: 'x' });
  assert.equal(e2.status, 404);
});

test('POST /agent 创建新任务并通过 SSE 收到 task_created + done', async () => {
  process.env.MOCK_LLM_COMPLETE = 'hi';
  const r = await postSSE('/agent', { message: '你好' });
  assert.equal(r.status, 200);
  const types = r.events.map((e) => e.type ?? (e.done ? 'done-flag' : 'unknown'));
  assert.ok(types.includes('task_created'));
  const taskCreated = r.events.find((e) => e.type === 'task_created');
  assert.ok(taskCreated?.runId, 'task_created 事件应携带 runId');
  assert.equal(typeof taskCreated.runId, 'string');
  assert.ok(r.events.some((e) => e.done));
  delete process.env.MOCK_LLM_COMPLETE;
});

test('POST /agent 在 running 任务上仅入队', async () => {
  const t = taskStore.createTask({ context: {} });
  taskStore.setStatus(t.id, 'running');
  // 这个请求会进入 running 分支并保持长连接 → 我们手动 abort
  const ac = new AbortController();
  const promise = fetch(`${base}/agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId: t.id, message: 'pending msg' }),
    signal: ac.signal,
  }).then((res) => res.body?.getReader().read()).catch(() => null);
  // 给路由一点时间入队
  await new Promise((r) => setTimeout(r, 50));
  ac.abort();
  await promise;
  assert.equal(t.pendingUserMessages.length, 1);
});

test('POST /agent 在 failed / completed 上继续对话会转 running 并继续流式', async () => {
  process.env.MOCK_LLM_COMPLETE = '恢复后回复';

  const failedTask = taskStore.createTask({ context: {} });
  taskStore.setStatus(failedTask.id, 'failed', { error: 'interrupted by restart' });
  const failedResult = await postSSE('/agent', { taskId: failedTask.id, message: '继续' });
  assert.equal(failedResult.status, 200);
  assert.equal(failedTask.status, 'completed');
  assert.equal(failedTask.error, undefined);
  assert.ok(failedResult.events.some((e) => e.type === 'delta'));

  const completedTask = taskStore.createTask({ context: {} });
  taskStore.setStatus(completedTask.id, 'completed');
  const completedResult = await postSSE('/agent', { taskId: completedTask.id, message: '再问一句' });
  assert.equal(completedResult.status, 200);
  assert.equal(completedTask.status, 'completed');
  assert.ok(completedResult.events.some((e) => e.type === 'delta'));

  delete process.env.MOCK_LLM_COMPLETE;
});

test('GET /agent/recover 按 context 严格匹配；无匹配返回 null', async () => {
  const a = taskStore.createTask({ context: { worldId: 'rec-A', characterId: null } });
  taskStore.setStatus(a.id, 'running');
  const b = taskStore.createTask({ context: { worldId: 'rec-B', characterId: null } });
  taskStore.setStatus(b.id, 'running');

  const hit = await getJSON('/agent/recover?worldId=rec-A');
  assert.equal(hit.status, 200);
  assert.equal(hit.json.task?.id, a.id, 'rec-A 应找到 a');

  const miss = await getJSON('/agent/recover?worldId=rec-C');
  assert.equal(miss.status, 200);
  assert.equal(miss.json.task, null, 'rec-C 无匹配应返回 null，不再跨上下文兜底');
});

test('GET /agent/recoverable-tasks 排除当前 context，列出其它可恢复任务', async () => {
  const a = taskStore.createTask({ context: { worldId: 'list-A', characterId: null } });
  taskStore.setStatus(a.id, 'running');
  const b = taskStore.createTask({ context: { worldId: 'list-B', characterId: null } });
  taskStore.setStatus(b.id, 'running');

  const r = await getJSON('/agent/recoverable-tasks?worldId=list-A');
  assert.equal(r.status, 200);
  const ids = (r.json.tasks ?? []).map((t) => t.id);
  assert.ok(ids.includes(b.id), '应包含其它 context 任务');
  assert.ok(!ids.includes(a.id), '不应包含当前 context');
});

test('POST /agent 拒绝跨上下文请求（context mismatch → 409）', async () => {
  const t = taskStore.createTask({ context: { worldId: 'ctx-A', characterId: null } });
  const res = await fetch(`${base}/agent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId: t.id, message: '哎', context: { worldId: 'ctx-B' } }),
  });
  assert.equal(res.status, 409);
});

test('POST /agent 在未执行的 running / interrupted 任务上可静默 resume，且不追加空 user 消息', async () => {
  process.env.MOCK_LLM_COMPLETE = '后台继续完成';

  const runningTask = taskStore.createTask({ context: {} });
  taskStore.appendMessage(runningTask.id, { id: 'u1', role: 'user', content: '先前需求' });
  taskStore.setStatus(runningTask.id, 'running');

  const runningResult = await postSSE('/agent', { taskId: runningTask.id, resume: true });
  assert.equal(runningResult.status, 200);
  assert.equal(runningTask.status, 'completed');
  assert.deepEqual(
    runningTask.messages.filter((m) => m.role === 'user').map((m) => m.content),
    ['先前需求'],
  );
  assert.ok(runningResult.events.some((e) => e.type === 'delta'));

  const completedTask = taskStore.createTask({ context: {} });
  taskStore.setStatus(completedTask.id, 'completed');
  const rejected = await postSSE('/agent', { taskId: completedTask.id, resume: true });
  assert.ok(rejected.events.some((e) => e.type === 'task_failed' && e.error === 'task is not resumable'));
  assert.equal(completedTask.status, 'completed');

  const interruptedTask = taskStore.createTask({ context: {} });
  taskStore.appendMessage(interruptedTask.id, { id: 'u2', role: 'user', content: '继续之前的任务' });
  taskStore.setStatus(interruptedTask.id, 'failed', { error: taskStore.RESTART_INTERRUPTED_ERROR });

  const interruptedResult = await postSSE('/agent', { taskId: interruptedTask.id, resume: true });
  assert.equal(interruptedResult.status, 200);
  assert.equal(interruptedTask.status, 'completed');
  assert.equal(interruptedTask.error, undefined);
  assert.deepEqual(
    interruptedTask.messages.filter((m) => m.role === 'user').map((m) => m.content),
    ['继续之前的任务'],
  );

  delete process.env.MOCK_LLM_COMPLETE;
});
