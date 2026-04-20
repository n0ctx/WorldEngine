import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import { insertCharacter, insertSession, insertWorld } from '../helpers/fixtures.js';

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
