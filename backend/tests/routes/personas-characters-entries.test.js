import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';
import {
  insertCharacter,
  insertPersona,
  insertWorld,
  insertWorldEntry,
} from '../helpers/fixtures.js';

const ctx = createRouteTestContext('routes-personas-chars-entries');
after(() => ctx.close());

// ─── personas routes ────────────────────────────────────────────────

test('GET /api/worlds/:worldId/persona 自动 ensure 并返回 active persona', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '路由-persona-世界' });
  const res = await ctx.request(`/api/worlds/${world.id}/persona`);
  assert.equal(res.status, 200);
  const persona = await res.json();
  assert.equal(persona.world_id, world.id);
});

test('PATCH /api/worlds/:worldId/persona 修改 active persona 字段', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '路由-persona-update' });
  insertPersona(ctx.sandbox.db, world.id, { name: '原名' });
  const res = await ctx.request(`/api/worlds/${world.id}/persona`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '新名', system_prompt: '你是新人' }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.name, '新名');
  assert.equal(data.system_prompt, '你是新人');
});

test('GET / POST /api/worlds/:worldId/personas 列表与新建', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '路由-personas-list' });
  const created = await ctx.request(`/api/worlds/${world.id}/personas`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '甲玩家', system_prompt: '你是甲' }),
  });
  assert.equal(created.status, 201);

  const list = await ctx.request(`/api/worlds/${world.id}/personas`);
  assert.equal(list.status, 200);
  const personas = await list.json();
  assert.ok(personas.length >= 1);
});

test('PATCH /api/worlds/:worldId/personas/:personaId/activate 校验归属', async () => {
  const worldA = insertWorld(ctx.sandbox.db, { name: '路由-激活-A' });
  const worldB = insertWorld(ctx.sandbox.db, { name: '路由-激活-B' });
  const personaB = insertPersona(ctx.sandbox.db, worldB.id, { name: 'B-1' });
  const personaA = insertPersona(ctx.sandbox.db, worldA.id, { name: 'A-1' });

  const fail = await ctx.request(`/api/worlds/${worldA.id}/personas/${personaB.id}/activate`, {
    method: 'PATCH',
  });
  assert.equal(fail.status, 400);

  const ok = await ctx.request(`/api/worlds/${worldA.id}/personas/${personaA.id}/activate`, {
    method: 'PATCH',
  });
  assert.equal(ok.status, 200);
});

test('GET /api/personas/:id 与 PATCH/DELETE 单条 persona', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '路由-单条-persona' });
  // 至少 2 张以便允许删除
  insertPersona(ctx.sandbox.db, world.id, { name: '保底' });
  const persona = insertPersona(ctx.sandbox.db, world.id, { name: '可删' });

  const got = await ctx.request(`/api/personas/${persona.id}`);
  assert.equal(got.status, 200);

  const notFound = await ctx.request('/api/personas/no-such');
  assert.equal(notFound.status, 404);

  const updated = await ctx.request(`/api/personas/${persona.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '改名', description: '说明' }),
  });
  assert.equal(updated.status, 200);
  const data = await updated.json();
  assert.equal(data.name, '改名');

  const del = await ctx.request(`/api/personas/${persona.id}`, { method: 'DELETE' });
  assert.equal(del.status, 204);

  const delAgain = await ctx.request(`/api/personas/${persona.id}`, { method: 'DELETE' });
  assert.equal(delAgain.status, 400);
});

// ─── characters routes ──────────────────────────────────────────────

test('GET /api/worlds/:worldId/characters 在世界不存在时 404', async () => {
  const fail = await ctx.request('/api/worlds/no-such/characters');
  assert.equal(fail.status, 404);
});

test('POST /api/worlds/:worldId/characters 校验 name 与 404', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '路由-角色-create' });
  const noName = await ctx.request(`/api/worlds/${world.id}/characters`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(noName.status, 400);

  const empty = await ctx.request(`/api/worlds/${world.id}/characters`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '   ' }),
  });
  assert.equal(empty.status, 400);

  const ghost = await ctx.request('/api/worlds/no-such/characters', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x' }),
  });
  assert.equal(ghost.status, 404);

  const ok = await ctx.request(`/api/worlds/${world.id}/characters`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '路由角色' }),
  });
  assert.equal(ok.status, 201);
});

test('GET /api/characters/:id 不存在 404；PUT/DELETE 不存在 404', async () => {
  const get404 = await ctx.request('/api/characters/no-such');
  assert.equal(get404.status, 404);

  const put404 = await ctx.request('/api/characters/no-such', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x' }),
  });
  assert.equal(put404.status, 404);

  const del404 = await ctx.request('/api/characters/no-such', { method: 'DELETE' });
  assert.equal(del404.status, 404);
});

test('PUT/DELETE /api/characters/:id 正常路径', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '路由-角色-update-del' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: 'old-name' });

  const upd = await ctx.request(`/api/characters/${character.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'new-name' }),
  });
  assert.equal(upd.status, 200);
  const data = await upd.json();
  assert.equal(data.name, 'new-name');

  const del = await ctx.request(`/api/characters/${character.id}`, { method: 'DELETE' });
  assert.equal(del.status, 204);
});

test('PUT /api/characters/reorder 校验 items 必填', async () => {
  const bad = await ctx.request('/api/characters/reorder', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(bad.status, 400);

  const empty = await ctx.request('/api/characters/reorder', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [] }),
  });
  assert.equal(empty.status, 400);

  const world = insertWorld(ctx.sandbox.db, { name: '路由-reorder' });
  const c1 = insertCharacter(ctx.sandbox.db, world.id, { name: 'a' });
  const ok = await ctx.request('/api/characters/reorder', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ id: c1.id, sort_order: 0 }] }),
  });
  assert.equal(ok.status, 200);
});

// ─── prompt-entries routes ──────────────────────────────────────────

test('GET / POST /api/worlds/:worldId/entries CRUD', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '路由-条目' });

  const list = await ctx.request(`/api/worlds/${world.id}/entries`);
  assert.equal(list.status, 200);

  const noTitle = await ctx.request(`/api/worlds/${world.id}/entries`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'no title' }),
  });
  assert.equal(noTitle.status, 400);

  const created = await ctx.request(`/api/worlds/${world.id}/entries`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '条目1', content: '内容', trigger_type: 'always' }),
  });
  assert.equal(created.status, 201);
});

test('GET / PUT / DELETE /api/world-entries/:id', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '路由-单条目' });
  const entry = insertWorldEntry(ctx.sandbox.db, world.id, { title: 't1', content: 'c' });

  const got = await ctx.request(`/api/world-entries/${entry.id}`);
  assert.equal(got.status, 200);

  const got404 = await ctx.request('/api/world-entries/no-such');
  assert.equal(got404.status, 404);

  const upd = await ctx.request(`/api/world-entries/${entry.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 't1-改' }),
  });
  assert.equal(upd.status, 200);

  const upd404 = await ctx.request('/api/world-entries/no-such', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'x' }),
  });
  assert.equal(upd404.status, 404);

  const del = await ctx.request(`/api/world-entries/${entry.id}`, { method: 'DELETE' });
  assert.equal(del.status, 204);
});

test('PUT /api/world-entries/reorder 校验参数', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '路由-条目-reorder' });
  const e1 = insertWorldEntry(ctx.sandbox.db, world.id, { title: 'a' });

  const bad1 = await ctx.request('/api/world-entries/reorder', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(bad1.status, 400);

  const bad2 = await ctx.request('/api/world-entries/reorder', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds: [] }),
  });
  assert.equal(bad2.status, 400);

  const bad3 = await ctx.request('/api/world-entries/reorder', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds: [e1.id], worldId: world.id, characterId: 'legacy' }),
  });
  assert.equal(bad3.status, 400);

  const ok = await ctx.request('/api/world-entries/reorder', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds: [e1.id], worldId: world.id }),
  });
  assert.equal(ok.status, 200);
});

test('GET / PUT /api/world-entries/:id/conditions 校验数组', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '路由-条件' });
  const entry = insertWorldEntry(ctx.sandbox.db, world.id, {
    title: 'state-entry',
    trigger_type: 'state',
    content: 'c',
  });

  const got = await ctx.request(`/api/world-entries/${entry.id}/conditions`);
  assert.equal(got.status, 200);

  const got404 = await ctx.request('/api/world-entries/no-such/conditions');
  assert.equal(got404.status, 404);

  const bad = await ctx.request(`/api/world-entries/${entry.id}/conditions`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(bad.status, 400);

  const ok = await ctx.request(`/api/world-entries/${entry.id}/conditions`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conditions: [{ target_field: '世界.X', operator: '>', value: '0' }] }),
  });
  assert.equal(ok.status, 200);

  const put404 = await ctx.request('/api/world-entries/no-such/conditions', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conditions: [] }),
  });
  assert.equal(put404.status, 404);
});
