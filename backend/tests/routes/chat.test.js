import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import { insertCharacter, insertMessage, insertSession, insertTurnRecord, insertWorld } from '../helpers/fixtures.js';

const sandbox = createTestSandbox('chat-route-suite', {
  global_system_prompt: '系统提示',
  context_history_rounds: 2,
});
sandbox.setEnv();

let server;

after(async () => {
  resetMockEnv();
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
  sandbox.cleanup();
});

async function ensureServer() {
  if (server) return server;
  const { createApp } = await freshImport('backend/server.js');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return server;
}

function parseSsePayloads(raw) {
  return raw
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const line = block.split('\n').find((item) => item.startsWith('data: '));
      return line ? JSON.parse(line.slice(6)) : null;
    })
    .filter(Boolean);
}

async function readSseEvents(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const line = block.split('\n').find((item) => item.startsWith('data: '));
      if (!line) continue;
      const payload = JSON.parse(line.slice(6));
      events.push(payload);
      await onEvent?.(payload);
    }
  }
  reader.releaseLock();
  return events;
}

test('POST /api/sessions/:sessionId/chat 返回完整 SSE 事件流并落库', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify(['你好', '，旅行者']);

  const appServer = await ensureServer();
  const { activeStreams } = await freshImport('backend/services/chat.js');

  const world = insertWorld(sandbox.db, { name: '白港' });
  const character = insertCharacter(sandbox.db, world.id, { name: '伊瑟' });
  const session = insertSession(sandbox.db, { character_id: character.id });

  const port = appServer.address().port;
  const response = await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '今天天气如何？' }),
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /^text\/event-stream/);

  const raw = await response.text();
  const events = parseSsePayloads(raw);
  const eventTypes = events.map((event) => {
    if (event.type) return event.type;
    if ('delta' in event) return 'delta';
    if (event.done) return 'done';
    if (event.aborted) return 'aborted';
    return 'unknown';
  });

  assert.equal(eventTypes[0], 'user_saved');
  assert.ok(eventTypes.includes('memory_recall_start'));
  assert.ok(eventTypes.includes('memory_recall_done'));
  assert.ok(eventTypes.includes('delta'));
  assert.equal(eventTypes.at(-1), 'done');

  const doneEvent = events.find((event) => event.done);
  assert.equal(doneEvent.assistant.content, '你好，旅行者');

  const rows = sandbox.db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(session.id);
  assert.deepEqual(rows.map((row) => row.role), ['user', 'assistant']);
  assert.equal(rows[0].content, '今天天气如何？');
  assert.equal(rows[1].content, '你好，旅行者');
  assert.equal(activeStreams.size, 0);
});

test('POST /api/sessions/:sessionId/chat 在 LLM 返回空内容时不落 assistant 消息', async () => {
  resetMockEnv();

  const appServer = await ensureServer();
  const world = insertWorld(sandbox.db, { name: '空流城' });
  const character = insertCharacter(sandbox.db, world.id, { name: '诺拉' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  const port = appServer.address().port;

  const response = await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '这次不要回复' }),
  });

  const events = parseSsePayloads(await response.text());
  assert.ok(events.some((event) => event.type === 'memory_recall_start'));
  assert.ok(events.some((event) => event.done));

  const rows = sandbox.db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(session.id);
  assert.deepEqual(rows, [{ role: 'user', content: '这次不要回复' }]);
});

test('POST /api/sessions/:sessionId/chat 在 LLM 异常且无已产出内容时返回 error 事件且不落 assistant 消息', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_STREAM_ERROR = 'mock stream failure';

  const appServer = await ensureServer();
  const world = insertWorld(sandbox.db, { name: '异常城' });
  const character = insertCharacter(sandbox.db, world.id, { name: '艾琳' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  const port = appServer.address().port;

  const response = await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '触发异常' }),
  });

  const events = parseSsePayloads(await response.text());
  assert.ok(events.some((event) => event.type === 'error' && event.error === 'mock stream failure'));
  assert.ok(!events.some((event) => event.done || event.aborted));

  const rows = sandbox.db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(session.id);
  assert.deepEqual(rows, [{ role: 'user', content: '触发异常' }]);
});

test('POST /api/sessions/:sessionId/chat 在 LLM 异常时返回 error 且不落 assistant 消息', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_STREAM_ERROR = 'stream exploded';

  const appServer = await ensureServer();
  const world = insertWorld(sandbox.db, { name: '半成品城' });
  const character = insertCharacter(sandbox.db, world.id, { name: '米洛' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  const port = appServer.address().port;

  const response = await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '给我一段半成品' }),
  });

  const events = parseSsePayloads(await response.text());
  assert.ok(events.some((event) => event.type === 'error' && event.error === 'stream exploded'));
  assert.ok(!events.some((event) => event.done));

  const rows = sandbox.db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(session.id);
  assert.deepEqual(rows, [{ role: 'user', content: '给我一段半成品' }]);
});

test('POST /stop 会中断当前流并保存已生成的部分内容', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify(['第一段', '第二段']);
  process.env.MOCK_LLM_STREAM_DELAYS = JSON.stringify([0, 200]);

  const appServer = await ensureServer();
  const { activeStreams } = await freshImport('backend/services/chat.js');

  const world = insertWorld(sandbox.db, { name: '止流城' });
  const character = insertCharacter(sandbox.db, world.id, { name: '珀尔' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  const port = appServer.address().port;

  const response = await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '开始说吧' }),
  });

  let stopped = false;
  const events = await readSseEvents(response, async (payload) => {
    if (!stopped && payload.delta === '第一段') {
      stopped = true;
      await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/stop`, { method: 'POST' });
    }
  });

  const abortedEvent = events.find((event) => event.aborted);
  assert.ok(abortedEvent);
  assert.match(abortedEvent.assistant.content, /第一段/);
  assert.match(abortedEvent.assistant.content, /\[已中断\]/);

  const rows = sandbox.db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(session.id);
  assert.deepEqual(rows.map((row) => row.role), ['user', 'assistant']);
  assert.match(rows[1].content, /第一段/);
  assert.match(rows[1].content, /\[已中断\]/);
  assert.equal(activeStreams.size, 0);
});

test('POST /api/sessions/:sessionId/chat 在客户端提前关闭时不落 assistant 消息并清理 activeStreams', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify(['第一段', '第二段']);
  process.env.MOCK_LLM_STREAM_DELAYS = JSON.stringify([0, 200]);

  const appServer = await ensureServer();
  const { activeStreams } = await freshImport('backend/services/chat.js');
  const world = insertWorld(sandbox.db, { name: '断连城' });
  const character = insertCharacter(sandbox.db, world.id, { name: '维拉' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  const port = appServer.address().port;

  const response = await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '说到一半我断开' }),
  });
  const reader = response.body.getReader();
  await reader.read();
  await reader.cancel();
  await new Promise((resolve) => setTimeout(resolve, 250));

  const rows = sandbox.db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(session.id);
  assert.deepEqual(rows.map((row) => row.role), ['user', 'assistant']);
  assert.match(rows[1].content, /第一段/);
  assert.match(rows[1].content, /\[已中断\]/);
  assert.equal(activeStreams.size, 0);
});

test('POST /stop 在没有活跃流时返回 success', async () => {
  resetMockEnv();

  const appServer = await ensureServer();
  const world = insertWorld(sandbox.db, { name: '空停止城' });
  const character = insertCharacter(sandbox.db, world.id, { name: '莱恩' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  const port = appServer.address().port;

  const response = await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/stop`, { method: 'POST' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
});

test('POST /continue 会把新内容追加到最后一条 assistant 消息', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify(['续写一', '续写二']);

  const appServer = await ensureServer();
  const world = insertWorld(sandbox.db, { name: '续写城' });
  const character = insertCharacter(sandbox.db, world.id, { name: '赛特' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '讲个故事', created_at: 1 });
  const lastAssistant = insertMessage(sandbox.db, session.id, { role: 'assistant', content: '原始回复', created_at: 2 });
  const port = appServer.address().port;

  const response = await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/continue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const raw = await response.text();
  const events = parseSsePayloads(raw);
  const doneEvent = events.find((event) => event.done);
  assert.ok(doneEvent);
  assert.equal(doneEvent.assistant.id, lastAssistant.id);
  assert.match(doneEvent.assistant.content, /原始回复/);
  assert.match(doneEvent.assistant.content, /续写一续写二/);

  const row = sandbox.db.prepare('SELECT content FROM messages WHERE id = ?').get(lastAssistant.id);
  assert.match(row.content, /原始回复/);
  assert.match(row.content, /续写一续写二/);
});

test('POST /continue 在没有 assistant 消息时返回 400', async () => {
  resetMockEnv();

  const appServer = await ensureServer();
  const world = insertWorld(sandbox.db, { name: '无回复城' });
  const character = insertCharacter(sandbox.db, world.id, { name: '索拉' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '只有用户消息', created_at: 1 });
  const port = appServer.address().port;

  const response = await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/continue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: '当前会话没有 AI 回复可续写' });
});

test('POST /continue 在最后一条 assistant 前没有 user 消息时返回 400', async () => {
  resetMockEnv();

  const appServer = await ensureServer();
  const world = insertWorld(sandbox.db, { name: '孤立回复城' });
  const character = insertCharacter(sandbox.db, world.id, { name: '洛安' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '开场白', created_at: 1 });
  const port = appServer.address().port;

  const response = await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/continue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: '当前会话没有可续写的用户-助手轮次' });
});

test('POST /regenerate 会删除 afterMessageId 之后的消息并截断 turn records', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify(['新的回答']);

  const appServer = await ensureServer();
  const world = insertWorld(sandbox.db, { name: '重生港' });
  const character = insertCharacter(sandbox.db, world.id, { name: '塔林' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  const user1 = insertMessage(sandbox.db, session.id, { role: 'user', content: '第一问', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '第一答', created_at: 2 });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '第二问', created_at: 3 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '第二答', created_at: 4 });
  insertTurnRecord(sandbox.db, session.id, { round_index: 1, summary: '第一轮' });
  insertTurnRecord(sandbox.db, session.id, { round_index: 2, summary: '第二轮' });
  const port = appServer.address().port;

  const response = await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ afterMessageId: user1.id }),
  });

  const raw = await response.text();
  const events = parseSsePayloads(raw);
  const doneEvent = events.find((event) => event.done);
  assert.ok(doneEvent);
  assert.equal(doneEvent.assistant.content, '新的回答');

  const rows = sandbox.db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(session.id);
  assert.deepEqual(rows.map((row) => row.role), ['user', 'assistant']);
  assert.equal(rows[0].content, '第一问');
  assert.equal(rows[1].content, '新的回答');

  const turnRecords = sandbox.db.prepare('SELECT round_index FROM turn_records WHERE session_id = ? ORDER BY round_index ASC').all(session.id);
  assert.deepEqual(turnRecords, []);
});

test('POST /regenerate 缺少 afterMessageId 时返回 400', async () => {
  resetMockEnv();

  const appServer = await ensureServer();
  const world = insertWorld(sandbox.db, { name: '参数城' });
  const character = insertCharacter(sandbox.db, world.id, { name: '琪雅' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  const port = appServer.address().port;

  const response = await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'afterMessageId is required' });
});

test('POST /regenerate 在 afterMessageId 非当前会话消息时返回 400', async () => {
  resetMockEnv();

  const appServer = await ensureServer();
  const world = insertWorld(sandbox.db, { name: '非法锚点城' });
  const character = insertCharacter(sandbox.db, world.id, { name: '赫敏' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '第一问', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '第一答', created_at: 2 });
  const anotherSession = insertSession(sandbox.db, { character_id: character.id });
  const foreignMessage = insertMessage(sandbox.db, anotherSession.id, { role: 'user', content: '外部消息', created_at: 3 });
  const port = appServer.address().port;

  const response = await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ afterMessageId: foreignMessage.id }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'afterMessageId does not belong to this session' });
});

test('POST /regenerate 在 afterMessageId 为 assistant 消息时返回 400', async () => {
  resetMockEnv();

  const appServer = await ensureServer();
  const world = insertWorld(sandbox.db, { name: '非法角色城' });
  const character = insertCharacter(sandbox.db, world.id, { name: '伊登' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '第一问', created_at: 1 });
  const assistant = insertMessage(sandbox.db, session.id, { role: 'assistant', content: '第一答', created_at: 2 });
  const port = appServer.address().port;

  const response = await fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ afterMessageId: assistant.id }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'afterMessageId must be a user message' });
});

test('同一 session 的第二个 /chat 会中断第一个流且不泄漏 activeStreams', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_STREAM_QUEUE = JSON.stringify(['第一条-慢速', '第二条-完成']);
  process.env.MOCK_LLM_STREAM_DELAYS = JSON.stringify([300]);

  const appServer = await ensureServer();
  const { activeStreams } = await freshImport('backend/services/chat.js');
  const world = insertWorld(sandbox.db, { name: '并发谷' });
  const character = insertCharacter(sandbox.db, world.id, { name: '埃文' });
  const session = insertSession(sandbox.db, { character_id: character.id });
  const port = appServer.address().port;

  const firstPromise = fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '第一条请求' }),
  }).then((res) => res.text());

  await new Promise((resolve) => setTimeout(resolve, 80));

  const secondPromise = fetch(`http://127.0.0.1:${port}/api/sessions/${session.id}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '第二条请求' }),
  }).then((res) => res.text());

  const [firstRaw, secondRaw] = await Promise.all([firstPromise, secondPromise]);
  const firstEvents = parseSsePayloads(firstRaw);
  const secondEvents = parseSsePayloads(secondRaw);

  assert.ok(firstEvents.some((event) => event.aborted));
  assert.ok(secondEvents.some((event) => event.done));

  const assistants = sandbox.db.prepare(`
    SELECT role, content FROM messages
    WHERE session_id = ? AND role = 'assistant'
    ORDER BY created_at ASC
  `).all(session.id);
  assert.ok(assistants.length >= 1 && assistants.length <= 2);
  assert.equal(assistants.at(-1).content, '第二条-完成');
  if (assistants.length === 2) {
    assert.match(assistants[0].content, /\[已中断\]/);
  }
  assert.equal(activeStreams.size, 0);
});
