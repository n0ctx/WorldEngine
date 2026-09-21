import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';
import { resetMockEnv } from '../helpers/test-env.js';
import { insertMessage, insertWorld } from '../helpers/fixtures.js';

const ctx = createRouteTestContext('writing-extra-route-suite', {
  global_system_prompt: '系统提示',
});
after(() => ctx.close());

function postJson(path, body) {
  return ctx.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

/** 建一个写作世界 + 写作会话，返回 { world, session } */
async function createWritingSession(name) {
  const world = insertWorld(ctx.sandbox.db, { name });
  const res = await ctx.request(`/api/worlds/${world.id}/writing-sessions`, { method: 'POST' });
  assert.equal(res.status, 200);
  return { world, session: await res.json() };
}

test('写作 /impersonate：session 不存在 → 404；跨世界 → 404；正常返回 content', async () => {
  resetMockEnv();

  const { world, session } = await createWritingSession('写作代入城');

  const miss = await postJson(`/api/worlds/${world.id}/writing-sessions/no-such/impersonate`);
  assert.equal(miss.status, 404);

  const otherWorld = insertWorld(ctx.sandbox.db, { name: '写作代入别处' });
  const crossWorld = await postJson(`/api/worlds/${otherWorld.id}/writing-sessions/${session.id}/impersonate`);
  assert.equal(crossWorld.status, 404);

  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q', created_at: 1 });

  process.env.MOCK_LLM_COMPLETE = '<think>X</think>这是玩家想说的话';
  const ok = await postJson(`/api/worlds/${world.id}/writing-sessions/${session.id}/impersonate`);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.match(body.content, /玩家想说/);
  assert.doesNotMatch(body.content, /<think>/);
});

test('写作 /impersonate：LLM 抛错时返回 500', async () => {
  resetMockEnv();
  const { world, session } = await createWritingSession('写作代入错误城');
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q', created_at: 1 });

  process.env.MOCK_LLM_COMPLETE_ERROR = 'llm dead';
  const res = await postJson(`/api/worlds/${world.id}/writing-sessions/${session.id}/impersonate`);
  assert.equal(res.status, 500);
});

test('写作 /edit-assistant：参数校验 + session 校验 + 成功路径', async () => {
  resetMockEnv();
  const { world, session } = await createWritingSession('写作编辑城');
  const base = `/api/worlds/${world.id}/writing-sessions/${session.id}/edit-assistant`;

  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q', created_at: 1 });
  const asst = insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a', created_at: 2 });

  const bad1 = await postJson(base, {});
  assert.equal(bad1.status, 400);
  const bad2 = await postJson(base, { messageId: asst.id });
  assert.equal(bad2.status, 400);
  const bad3 = await postJson(base, { messageId: asst.id, content: 12345 });
  assert.equal(bad3.status, 400);

  const miss = await postJson(
    `/api/worlds/${world.id}/writing-sessions/no-such/edit-assistant`,
    { messageId: asst.id, content: '新' },
  );
  assert.equal(miss.status, 404);

  const ok = await postJson(base, { messageId: asst.id, content: '新内容' });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { success: true });

  const row = ctx.sandbox.db.prepare('SELECT content FROM messages WHERE id = ?').get(asst.id);
  assert.equal(row.content, '新内容');

  // 命中「非最后一条 assistant」分支：再插一轮后编辑老的
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q2', created_at: 3 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a2', created_at: 4 });
  const ok2 = await postJson(base, { messageId: asst.id, content: '改老的' });
  assert.equal(ok2.status, 200);
});

test('写作 /edit-assistant：触发 message:edited hook', async () => {
  resetMockEnv();
  const { freshImport } = await import('../helpers/test-env.js');
  const { registerHook } = await freshImport('backend/hooks/hook-registry.js');

  const { world, session } = await createWritingSession('写作编辑钩子城');
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q', created_at: 1 });
  const asst = insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a', created_at: 2 });

  let fired = false;
  registerHook('message:edited', async (payload) => {
    if (payload.sessionId === session.id) fired = true;
  }, { label: 'writing-message-edited-test' });

  const res = await postJson(
    `/api/worlds/${world.id}/writing-sessions/${session.id}/edit-assistant`,
    { messageId: asst.id, content: '编辑过的内容' },
  );
  assert.equal(res.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(fired, true, '写作侧应与对话侧一致触发 message:edited');
});

test('写作 /retitle：session 不存在 → 404；正常路径返回 title', async () => {
  resetMockEnv();
  const { world, session } = await createWritingSession('写作改名城');

  const miss = await postJson(`/api/worlds/${world.id}/writing-sessions/no-such/retitle`);
  assert.equal(miss.status, 404);

  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q', created_at: 1 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: '<think>思考</think>答', created_at: 2 });

  process.env.MOCK_LLM_COMPLETE = '<think>x</think>新「标题」';
  const ok = await postJson(`/api/worlds/${world.id}/writing-sessions/${session.id}/retitle`);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(typeof body.title, 'string');
  assert.doesNotMatch(body.title, /[「」"']/);

  const row = ctx.sandbox.db.prepare('SELECT title FROM sessions WHERE id = ?').get(session.id);
  assert.equal(row.title, body.title);
});

test('写作 /retitle：LLM 返回空时返回 title:null', async () => {
  resetMockEnv();
  const { world, session } = await createWritingSession('写作空标题城');
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q', created_at: 1 });

  process.env.MOCK_LLM_COMPLETE = '';
  const ok = await postJson(`/api/worlds/${world.id}/writing-sessions/${session.id}/retitle`);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { title: null });
});

test('写作 /retitle：LLM 抛错时返回 500', async () => {
  resetMockEnv();
  const { world, session } = await createWritingSession('写作标题错误城');
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q', created_at: 1 });

  process.env.MOCK_LLM_COMPLETE_ERROR = 'llm dead';
  const res = await postJson(`/api/worlds/${world.id}/writing-sessions/${session.id}/retitle`);
  assert.equal(res.status, 500);
});
