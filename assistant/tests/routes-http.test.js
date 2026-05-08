import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from '../../backend/node_modules/express/index.js';

import { createTestSandbox, freshImport, resetMockEnv } from '../../backend/tests/helpers/test-env.js';
import {
  insertWorld,
  insertMessage,
} from '../../backend/tests/helpers/fixtures.js';

function insertWritingSession(db, worldId, patch = {}) {
  const id = patch.id ?? `s-${Math.random().toString(16).slice(2, 8)}`;
  const now = Date.now();
  db.prepare(
    `INSERT INTO sessions (id, character_id, world_id, mode, title, compressed_context, diary_date_mode, created_at, updated_at)
     VALUES (?, NULL, ?, 'writing', NULL, NULL, NULL, ?, ?)`,
  ).run(id, worldId, now, now);
  return { id, world_id: worldId };
}

const sandbox = createTestSandbox('assistant-routes-http');
sandbox.setEnv();

const router = (await freshImport('assistant/server/routes.js')).default;
const taskStore = await freshImport('assistant/server/task-store.js');
const planDoc = await freshImport('assistant/server/plan-doc.js');

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

test('GET /agent/:taskId/plan-doc 文件不存在返回空字符串', async () => {
  const r = await getJSON('/agent/no-task/plan-doc');
  assert.equal(r.status, 200);
  assert.equal(r.json.content, '');
});

test('POST /agent/:taskId/cancel 切换状态并清理 plan doc', async () => {
  const t = taskStore.createTask({ context: {} });
  await planDoc.writePlanDoc(t.id, '# x');
  const r = await postJSON(`/agent/${t.id}/cancel`, {});
  assert.equal(r.status, 200);
  assert.equal(t.status, 'cancelled');

  const r404 = await postJSON('/agent/no-such/cancel', {});
  assert.equal(r404.status, 404);
});

test('POST /agent/:taskId/approve 拒绝非 awaiting_approval 任务', async () => {
  const t = taskStore.createTask({ context: {} });
  const r = await postJSON(`/agent/${t.id}/approve`, {});
  assert.equal(r.status, 400);
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

  // executing 状态拒绝 truncate 与 delete
  taskStore.setStatus(t.id, 'executing');
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
  process.env.MOCK_LLM_STREAM = 'hi';
  const r = await postSSE('/agent', { message: '你好' });
  assert.equal(r.status, 200);
  const types = r.events.map((e) => e.type ?? (e.done ? 'done-flag' : 'unknown'));
  assert.ok(types.includes('task_created'));
  assert.ok(r.events.some((e) => e.done));
  delete process.env.MOCK_LLM_STREAM;
});

test('POST /agent 在 executing 任务上仅入队', async () => {
  const t = taskStore.createTask({ context: {} });
  taskStore.setStatus(t.id, 'executing');
  // 这个请求会进入 executing 分支并保持长连接 → 我们手动 abort
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

test('POST /extract-characters 参数缺失返回 400', async () => {
  const r = await postJSON('/extract-characters', {});
  assert.equal(r.status, 400);
});

test('POST /extract-characters 走完一轮（dryRun）', async () => {
  const world = insertWorld(sandbox.db, { name: 'extract-w' });
  const session = insertWritingSession(sandbox.db, world.id, { id: 's1' });
  const userMsg = insertMessage(sandbox.db, session.id, { role: 'user', content: '场景：城里出现一个铁匠' });
  const aMsg = insertMessage(sandbox.db, session.id, { role: 'assistant', content: '铁匠张三敲打着铁锤' });

  // 校验：session 不属于 world → 400
  const r400a = await postJSON('/extract-characters', { worldId: 'wrong', sessionId: session.id, assistantMessageId: aMsg.id });
  assert.equal(r400a.status, 400);
  // 校验：消息 id 错误 → 400
  const r400b = await postJSON('/extract-characters', { worldId: world.id, sessionId: session.id, assistantMessageId: userMsg.id });
  assert.equal(r400b.status, 400);

  // mock LLM 返回一个角色数组
  process.env.MOCK_LLM_COMPLETE = JSON.stringify([{ name: '张三', description: '铁匠' }]);
  const r = await postSSE('/extract-characters', { worldId: world.id, sessionId: session.id, assistantMessageId: aMsg.id, dryRun: true });
  assert.equal(r.status, 200);
  const types = r.events.map((e) => e.type);
  assert.ok(types.includes('characters_extracted'));
  delete process.env.MOCK_LLM_COMPLETE;
});

test('POST /confirm-characters 参数缺失返回 400', async () => {
  const r = await postJSON('/confirm-characters', {});
  assert.equal(r.status, 400);
});

test('POST /confirm-characters 走完一轮', async () => {
  const world = insertWorld(sandbox.db, { name: 'confirm-w' });
  const session = insertWritingSession(sandbox.db, world.id, { id: 'cs1' });

  // session 不属于 world → 400
  const r400 = await postJSON('/confirm-characters', { worldId: 'wrong', sessionId: session.id, characters: [{ name: 'x' }] });
  assert.equal(r400.status, 400);

  const r = await postSSE('/confirm-characters', {
    worldId: world.id,
    sessionId: session.id,
    characters: [{ name: '李四', description: '商人' }],
  });
  assert.equal(r.status, 200);
  const types = r.events.map((e) => e.type);
  assert.ok(types.some((t) => ['card_activated', 'character_found'].includes(t)));
});
