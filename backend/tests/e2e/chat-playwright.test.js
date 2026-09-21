import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import path from 'node:path';

import { chromium } from 'playwright';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import { insertCharacter, insertWorld } from '../helpers/fixtures.js';

const RUN_E2E = process.env.WE_E2E === '1';
const sandbox = createTestSandbox('playwright-chat-suite', {
  global_system_prompt: '系统提示',
});
sandbox.setEnv();

let backendServer;
let frontendServer;
let frontendBaseUrl;

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  return port;
}

async function waitForUrl(url, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function ensureBackendServer() {
  if (backendServer) return backendServer;
  const { startServer } = await freshImport('backend/server.js');
  backendServer = startServer({ host: '127.0.0.1', port: 0 });
  await new Promise((resolve) => backendServer.once('listening', resolve));
  return backendServer;
}

async function ensureFrontendServer(backendPort) {
  if (frontendServer) return frontendBaseUrl;
  const frontendPort = await getFreePort();
  frontendBaseUrl = `http://127.0.0.1:${frontendPort}`;
  const frontendRoot = path.resolve(process.cwd(), 'frontend');
  process.env.VITE_BACKEND_URL = `http://127.0.0.1:${backendPort}`;
  const { createServer: createViteServer } = await import('vite');
  frontendServer = await createViteServer({
    root: frontendRoot,
    server: {
      host: '127.0.0.1',
      port: frontendPort,
      strictPort: true,
    },
  });
  await frontendServer.listen();
  return frontendBaseUrl;
}

after(async () => {
  resetMockEnv();
  if (frontendServer) await frontendServer.close();
  if (backendServer) {
    await new Promise((resolve, reject) => {
      backendServer.close((err) => (err ? reject(err) : resolve()));
    });
  }
  sandbox.cleanup();
});

test('Playwright: 聊天页可以新建会话并完成一次真实收发', {
  timeout: 30000,
  skip: !RUN_E2E,
}, async () => {
  resetMockEnv();
  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify(['来自浏览器', '的回复']);

  const backend = await ensureBackendServer();
  const frontendUrl = await ensureFrontendServer(backend.address().port);

  const world = insertWorld(sandbox.db, { name: '浏览器世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '银雀' });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(`${frontendUrl}/characters/${character.id}/chat`);
    // 两侧面板默认收起成窄轨，「新建会话」在左侧抽屉里，需先展开
    await page.getByRole('button', { name: '展开会话列表' }).click();
    await page.getByRole('button', { name: '新建会话' }).click();
    const input = page.getByPlaceholder('发送消息… (Shift+Enter 换行，/ 调出命令)');
    await input.fill('浏览器测试消息');
    await page.getByTitle('发送 (Enter)').click();

    await page.getByText('浏览器测试消息').waitFor({ timeout: 10000 });
    await page.getByText('来自浏览器的回复').waitFor({ timeout: 10000 });

    const rows = sandbox.db.prepare('SELECT role, content FROM messages ORDER BY created_at ASC').all();
    assert.deepEqual(rows.map((row) => row.role), ['user', 'assistant']);
    assert.equal(rows[0].content, '浏览器测试消息');
    assert.equal(rows[1].content, '来自浏览器的回复');
  } finally {
    await browser.close();
  }
});

test('Playwright: 写作页可以自动建会话并完成一次真实收发', {
  timeout: 30000,
  skip: !RUN_E2E,
}, async () => {
  resetMockEnv();
  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify(['写作', '回复']);

  const backend = await ensureBackendServer();
  const frontendUrl = await ensureFrontendServer(backend.address().port);

  const world = insertWorld(sandbox.db, { name: '写作世界' });
  insertCharacter(sandbox.db, world.id, { name: '银雀' });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(`${frontendUrl}/worlds/${world.id}/writing`);
    const input = page.getByPlaceholder('发送消息… (Shift+Enter 换行，/ 调出命令)');
    await input.fill('写作测试消息');
    await page.getByTitle('发送 (Enter)').click();

    await page.getByText('写作测试消息').waitFor({ timeout: 10000 });
    await page.getByText('写作回复').waitFor({ timeout: 10000 });

    const session = sandbox.db.prepare(
      `SELECT id FROM sessions
       WHERE world_id = ? AND mode = 'writing'
       ORDER BY created_at DESC
       LIMIT 1`,
    ).get(world.id);
    assert.ok(session?.id);
    const rows = sandbox.db.prepare('SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(session.id);
    assert.deepEqual(rows.map((row) => row.role), ['user', 'assistant']);
    assert.equal(rows[0].content, '写作测试消息');
    assert.equal(rows[1].content, '写作回复');
  } finally {
    await browser.close();
  }
});
