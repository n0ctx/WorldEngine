import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../../backend/tests/helpers/test-env.js';

const sandbox = createTestSandbox('assistant-route-suite');
sandbox.setEnv();

let server;

async function ensureServer() {
  if (server) return server;
  const { createApp } = await freshImport('backend/server.js');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return server;
}

async function request(path, init = {}) {
  const appServer = await ensureServer();
  return fetch(`http://127.0.0.1:${appServer.address().port}${path}`, init);
}

after(async () => {
  resetMockEnv();
  if (server) {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
  sandbox.cleanup();
});

test('POST /api/assistant/chat 对空 message 返回 400', async () => {
  const res = await request('/api/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '   ' }),
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /message 为必填项/);
});

test('POST /api/assistant/execute 会消费 token 并落库 world-card create', async () => {
  const { __testables } = await import('../server/routes.js');
  __testables.proposalStore.set('token-create-world', {
    expiresAt: Date.now() + 60_000,
    proposal: {
      type: 'world-card',
      operation: 'create',
      explanation: '创建世界',
      changes: {
        name: '新世界',
        system_prompt: '世界设定',
        post_prompt: '后置',
      },
      entryOps: [],
      stateFieldOps: [],
    },
  });

  const res = await request('/api/assistant/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'token-create-world' }),
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.result.name, '新世界');

  const worlds = sandbox.db.prepare('SELECT name, system_prompt, post_prompt FROM worlds').all();
  assert.deepEqual(worlds, [{
    name: '新世界',
    system_prompt: '世界设定',
    post_prompt: '后置',
  }]);
  assert.equal(__testables.proposalStore.has('token-create-world'), false);
});
