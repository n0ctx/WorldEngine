import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';
import {
  insertCharacter,
  insertMessage,
  insertSession,
  insertWorld,
} from '../helpers/fixtures.js';

const ctx = createRouteTestContext('routes-sessions-suite');
after(() => ctx.close());

test('GET /api/characters/:id/sessions 列表与角色不存在返回 404', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '路由-世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '路由-角色' });
  insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });

  const res = await ctx.request(`/api/characters/${character.id}/sessions`);
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.equal(list.length, 2);

  const missing = await ctx.request('/api/characters/nope/sessions');
  assert.equal(missing.status, 404);
});

test('POST /api/characters/:id/sessions 在角色不存在时 404，否则 201 并自动创建会话', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '世界-create-session' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '路由-创建' });

  const ok = await ctx.request(`/api/characters/${character.id}/sessions`, { method: 'POST' });
  assert.equal(ok.status, 201);
  const session = await ok.json();
  assert.ok(session.id);

  const fail = await ctx.request('/api/characters/ghost/sessions', { method: 'POST' });
  assert.equal(fail.status, 404);
});

test('GET /api/sessions/:id 与 /messages 在会话不存在时 404', async () => {
  const r1 = await ctx.request('/api/sessions/no-such');
  assert.equal(r1.status, 404);
  const r2 = await ctx.request('/api/sessions/no-such/messages');
  assert.equal(r2.status, 404);
});

test('GET /api/sessions/:id/messages 返回分页结果', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '消息-世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '消息-角色' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q1' });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a1' });

  const res = await ctx.request(`/api/sessions/${session.id}/messages?limit=10`);
  assert.equal(res.status, 200);
  const msgs = await res.json();
  assert.equal(msgs.length, 2);
});

test('PUT /api/sessions/:id/title 修改标题；不存在 404', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '标题-世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '标题-角色' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });

  const ok = await ctx.request(`/api/sessions/${session.id}/title`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '新标题' }),
  });
  assert.equal(ok.status, 200);
  const data = await ok.json();
  assert.equal(data.title, '新标题');

  const fail = await ctx.request('/api/sessions/ghost/title', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'x' }),
  });
  assert.equal(fail.status, 404);
});

test('POST /api/sessions/:id/messages 校验 role/content 必填', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '校验-世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '校验-角色' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });

  const bad = await ctx.request(`/api/sessions/${session.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'user' }),
  });
  assert.equal(bad.status, 400);

  const ok = await ctx.request(`/api/sessions/${session.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'user', content: 'hi' }),
  });
  assert.equal(ok.status, 201);
});

test('POST /api/sessions/:id/messages 在会话不存在时 404', async () => {
  const res = await ctx.request('/api/sessions/no-such/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'user', content: 'x' }),
  });
  assert.equal(res.status, 404);
});

test('PUT /api/messages/:id 在消息不存在时 404，content 非字符串时 400', async () => {
  const r1 = await ctx.request('/api/messages/ghost', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'x' }),
  });
  assert.equal(r1.status, 404);

  const world = insertWorld(ctx.sandbox.db, { name: 'edit-世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: 'edit-角色' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  const msg = insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'old' });

  const r2 = await ctx.request(`/api/messages/${msg.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 123 }),
  });
  assert.equal(r2.status, 400);
});

test('GET /api/worlds/:id/latest-chat-session 在无会话时 404', async () => {
  const res = await ctx.request('/api/worlds/no-such-world/latest-chat-session');
  assert.equal(res.status, 404);
});

test('DELETE /api/sessions/:sessionId/messages/:messageId 在会话或消息不存在时返回 404', async () => {
  const r1 = await ctx.request('/api/sessions/ghost/messages/m1', { method: 'DELETE' });
  assert.equal(r1.status, 404);

  const world = insertWorld(ctx.sandbox.db, { name: 'del-msg-世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: 'del-msg-角色' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  const r2 = await ctx.request(`/api/sessions/${session.id}/messages/no-such-msg`, { method: 'DELETE' });
  assert.equal(r2.status, 404);
});

test('DELETE /api/sessions/:id 删除会话；不存在时 404', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'del-世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: 'del-角色' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });

  const ok = await ctx.request(`/api/sessions/${session.id}`, { method: 'DELETE' });
  assert.equal(ok.status, 204);

  const fail = await ctx.request('/api/sessions/ghost', { method: 'DELETE' });
  assert.equal(fail.status, 404);
});
