import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const TEMP_ROOT = path.join(REPO_ROOT, '.temp', 'client-logs-route');
fs.mkdirSync(TEMP_ROOT, { recursive: true });
const root = fs.mkdtempSync(path.join(TEMP_ROOT, 'shared-'));
process.env.WE_DATA_DIR = root;
process.env.LOG_LEVEL = 'error';
process.env.LOG_FILE = 'true';

let server;
let baseUrl;

before(async () => {
  const mod = await import(
    pathToFileURL(path.resolve(REPO_ROOT, 'backend/routes/client-logs.js')).href
  );
  const app = express();
  app.use('/api/client-logs', mod.default);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(() => {
  server?.closeAllConnections?.();
  server?.close();
  fs.rmSync(root, { recursive: true, force: true });
});

async function postJson(p, body) {
  return fetch(`${baseUrl}${p}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/client-logs', () => {
  it('200 返回 accepted/dropped', async () => {
    const res = await postJson('/api/client-logs', {
      client: { ua: 'UA', page: '/x', session: 'fe1', ts: 1 },
      logs: [{ level: 'error', event: 'a.b', ts: 1 }],
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.accepted, 1);
    assert.equal(body.dropped, 0);
  });

  it('400 当 logs 不是数组', async () => {
    const res = await postJson('/api/client-logs', { logs: 'oops' });
    assert.equal(res.status, 400);
  });

  it('413 当 payload 过大', async () => {
    const big = 'x'.repeat(300 * 1024);
    const res = await postJson('/api/client-logs', {
      client: { ua: 'UA', page: '/x', session: 'fe1', ts: 1 },
      logs: [{ level: 'error', event: 'a.b', ts: 1, payload: { big } }],
    });
    assert.equal(res.status, 413);
  });

  it('429 当短时间高频调用', async () => {
    let lastStatus = 200;
    for (let i = 0; i < 25; i += 1) {
      const r = await postJson('/api/client-logs', {
        client: { ua: 'UA', page: '/x', session: 'fe1', ts: 1 },
        logs: [],
      });
      lastStatus = r.status;
    }
    assert.equal(lastStatus, 429);
  });
});
