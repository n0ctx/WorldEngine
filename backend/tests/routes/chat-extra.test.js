import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';
import { insertCharacter, insertMessage, insertSession, insertWorld } from '../helpers/fixtures.js';
import { resetMockEnv } from '../helpers/test-env.js';

const ctx = createRouteTestContext('chat-extra-route-suite', {
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

test('POST /chat：缺 content 或非字符串 → 400；session 不存在 → 404', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '校验城' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '伊娜' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });

  const r1 = await postJson(`/api/sessions/${session.id}/chat`, {});
  assert.equal(r1.status, 400);

  const r2 = await postJson(`/api/sessions/${session.id}/chat`, { content: 12345 });
  assert.equal(r2.status, 400);

  const r3 = await postJson(`/api/sessions/${session.id}/chat`, { content: '' });
  assert.equal(r3.status, 400);

  const r4 = await postJson('/api/sessions/no-such-session/chat', { content: 'hi' });
  assert.equal(r4.status, 404);
});

test('POST /regenerate：session 不存在 → 404；afterMessageId 不存在 → 404', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'regen 校验' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '阿尔忒' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });

  const r1 = await postJson('/api/sessions/no-such/regenerate', { afterMessageId: 'x' });
  assert.equal(r1.status, 404);

  const r2 = await postJson(`/api/sessions/${session.id}/regenerate`, { afterMessageId: 'no-msg' });
  assert.equal(r2.status, 404);
});

test('POST /continue：session 不存在 → 404', async () => {
  const r = await postJson('/api/sessions/ghost/continue');
  assert.equal(r.status, 404);
});

test('POST /edit-assistant：参数校验 + session 校验 + 成功路径', async () => {
  resetMockEnv();
  const world = insertWorld(ctx.sandbox.db, { name: '编辑城' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '编辑者' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  const userMsg = insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q', created_at: 1 });
  const asst = insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a', created_at: 2 });

  const bad1 = await postJson(`/api/sessions/${session.id}/edit-assistant`, {});
  assert.equal(bad1.status, 400);
  const bad2 = await postJson(`/api/sessions/${session.id}/edit-assistant`, { messageId: asst.id });
  assert.equal(bad2.status, 400);
  const bad3 = await postJson(`/api/sessions/${session.id}/edit-assistant`, { messageId: asst.id, content: 12345 });
  assert.equal(bad3.status, 400);

  const miss = await postJson('/api/sessions/no-such/edit-assistant', { messageId: asst.id, content: '新' });
  assert.equal(miss.status, 404);

  const ok = await postJson(`/api/sessions/${session.id}/edit-assistant`, { messageId: asst.id, content: '新内容' });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.success, true);

  // 命中"非最后一条 assistant"分支：再插入一条 assistant 消息后编辑老的
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q2', created_at: 3 });
  const newer = insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a2', created_at: 4 });
  const ok2 = await postJson(`/api/sessions/${session.id}/edit-assistant`, { messageId: asst.id, content: '改老的' });
  assert.equal(ok2.status, 200);

  // 引用 newer 防止 unused
  assert.ok(userMsg.id);
  assert.ok(newer.id);
});

test('POST /retitle：session 不存在 → 404；正常路径返回 title', async () => {
  resetMockEnv();
  const miss = await postJson('/api/sessions/no-such/retitle');
  assert.equal(miss.status, 404);

  const world = insertWorld(ctx.sandbox.db, { name: '改名城' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '改名者' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q', created_at: 1 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: '<think>思考</think>答', created_at: 2 });

  process.env.MOCK_LLM_COMPLETE = '<think>x</think>新「标题」';
  const ok = await postJson(`/api/sessions/${session.id}/retitle`);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(typeof body.title, 'string');
  assert.doesNotMatch(body.title, /[「」"']/);
});

test('POST /retitle：LLM 返回空时返回 title:null', async () => {
  resetMockEnv();
  const world = insertWorld(ctx.sandbox.db, { name: '空标题城' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '空' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q', created_at: 1 });

  process.env.MOCK_LLM_COMPLETE = '';
  const ok = await postJson(`/api/sessions/${session.id}/retitle`);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.title, null);
});

test('POST /retitle：LLM 抛错时返回 500', async () => {
  resetMockEnv();
  const world = insertWorld(ctx.sandbox.db, { name: '错误城' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: 'X' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q', created_at: 1 });

  process.env.MOCK_LLM_COMPLETE_ERROR = 'llm dead';
  const r = await postJson(`/api/sessions/${session.id}/retitle`);
  assert.equal(r.status, 500);
});

test('POST /impersonate：session 不存在 → 404；缺 character/world → 400；正常返回 content', async () => {
  resetMockEnv();
  const r1 = await postJson('/api/sessions/ghost/impersonate');
  assert.equal(r1.status, 404);

  // 不挂角色的 session
  const orphan = insertSession(ctx.sandbox.db, { character_id: null, world_id: null });
  const r2 = await postJson(`/api/sessions/${orphan.id}/impersonate`);
  assert.equal(r2.status, 400);

  // 正常路径
  const world = insertWorld(ctx.sandbox.db, { name: '代入城' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '代入者' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q', created_at: 1 });

  process.env.MOCK_LLM_COMPLETE = '<think>X</think>这是用户想说的话';
  const ok = await postJson(`/api/sessions/${session.id}/impersonate`);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.match(body.content, /用户想说/);
  assert.doesNotMatch(body.content, /<think>/);
});
