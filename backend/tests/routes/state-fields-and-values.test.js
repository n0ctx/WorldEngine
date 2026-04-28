import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';
import {
  insertCharacter,
  insertCharacterStateField,
  insertPersonaStateField,
  insertWorld,
  insertWorldStateField,
} from '../helpers/fixtures.js';

const ctx = createRouteTestContext('routes-state-fields-values');
after(() => ctx.close());

// ─── world-state-fields ─────────────────────────────────────────────

test('GET /api/worlds/:worldId/world-state-fields 返回字段列表', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '字段列表-世界' });
  insertWorldStateField(ctx.sandbox.db, world.id, { field_key: 'a', label: 'A' });
  insertWorldStateField(ctx.sandbox.db, world.id, { field_key: 'b', label: 'B' });

  const res = await ctx.request(`/api/worlds/${world.id}/world-state-fields`);
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.equal(list.length, 2);
});

test('POST /api/worlds/:worldId/world-state-fields 校验必填并 201 返回；重复 field_key 409', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '字段创建-世界' });

  const bad = await ctx.request(`/api/worlds/${world.id}/world-state-fields`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field_key: 'x' }),
  });
  assert.equal(bad.status, 400);

  const ok = await ctx.request(`/api/worlds/${world.id}/world-state-fields`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field_key: 'weather', label: '天气', type: 'text' }),
  });
  assert.equal(ok.status, 201);

  const dup = await ctx.request(`/api/worlds/${world.id}/world-state-fields`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field_key: 'weather', label: 'X', type: 'text' }),
  });
  assert.equal(dup.status, 409);
});

test('PUT /api/world-state-fields/:id 更新；不存在 404', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '字段更新-世界' });
  const field = insertWorldStateField(ctx.sandbox.db, world.id, { field_key: 'mood', label: '心情', type: 'text' });

  const ok = await ctx.request(`/api/world-state-fields/${field.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: '心境' }),
  });
  assert.equal(ok.status, 200);

  const fail = await ctx.request('/api/world-state-fields/no-such', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: 'x' }),
  });
  assert.equal(fail.status, 404);
});

test('DELETE /api/world-state-fields/:id 返回 204', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '字段删除-世界' });
  const field = insertWorldStateField(ctx.sandbox.db, world.id, { field_key: 'd', label: 'D', type: 'text' });

  const res = await ctx.request(`/api/world-state-fields/${field.id}`, { method: 'DELETE' });
  assert.equal(res.status, 204);
});

test('PUT /api/worlds/:worldId/world-state-fields/reorder 校验数组并 200', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '字段重排-世界' });
  const f1 = insertWorldStateField(ctx.sandbox.db, world.id, { field_key: 'a', label: 'A', type: 'text', sort_order: 0 });
  const f2 = insertWorldStateField(ctx.sandbox.db, world.id, { field_key: 'b', label: 'B', type: 'text', sort_order: 1 });

  const bad = await ctx.request(`/api/worlds/${world.id}/world-state-fields/reorder`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds: 'not-array' }),
  });
  assert.equal(bad.status, 400);

  const ok = await ctx.request(`/api/worlds/${world.id}/world-state-fields/reorder`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds: [f2.id, f1.id] }),
  });
  assert.equal(ok.status, 200);
});

// ─── character-state-fields（同形）─────────────────────────────────

test('character-state-fields 全 CRUD + reorder + 校验', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'char-字段-世界' });

  // POST 校验
  const bad = await ctx.request(`/api/worlds/${world.id}/character-state-fields`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(bad.status, 400);

  const created = await ctx.request(`/api/worlds/${world.id}/character-state-fields`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field_key: 'hp', label: 'HP', type: 'number' }),
  });
  assert.equal(created.status, 201);
  const field = await created.json();

  // 重复
  const dup = await ctx.request(`/api/worlds/${world.id}/character-state-fields`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field_key: 'hp', label: 'X', type: 'text' }),
  });
  assert.equal(dup.status, 409);

  // GET
  const list = await ctx.request(`/api/worlds/${world.id}/character-state-fields`);
  assert.equal(list.status, 200);

  // PUT (update)
  const upd = await ctx.request(`/api/character-state-fields/${field.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: '生命' }),
  });
  assert.equal(upd.status, 200);
  const upd404 = await ctx.request('/api/character-state-fields/no-such', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: 'x' }),
  });
  assert.equal(upd404.status, 404);

  // reorder
  const reorderBad = await ctx.request(`/api/worlds/${world.id}/character-state-fields/reorder`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds: null }),
  });
  assert.equal(reorderBad.status, 400);

  const reorderOk = await ctx.request(`/api/worlds/${world.id}/character-state-fields/reorder`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds: [field.id] }),
  });
  assert.equal(reorderOk.status, 200);

  // DELETE
  const del = await ctx.request(`/api/character-state-fields/${field.id}`, { method: 'DELETE' });
  assert.equal(del.status, 204);
});

// ─── world-state-values ─────────────────────────────────────────────

test('world-state-values: GET / PATCH(校验/404) / reset', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'world-值-世界' });
  insertWorldStateField(ctx.sandbox.db, world.id, {
    field_key: 'climate', label: '气候', type: 'text', allow_empty: 1,
  });

  // GET
  const list = await ctx.request(`/api/worlds/${world.id}/state-values`);
  assert.equal(list.status, 200);

  // PATCH 缺 value_json → 400
  const bad = await ctx.request(`/api/worlds/${world.id}/state-values/climate`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(bad.status, 400);

  // PATCH 世界不存在 → 404
  const noWorld = await ctx.request('/api/worlds/no-such/state-values/climate', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value_json: '"温和"' }),
  });
  assert.equal(noWorld.status, 404);

  // PATCH 字段不存在 → 400（services 抛"状态字段不存在"）
  const noField = await ctx.request(`/api/worlds/${world.id}/state-values/ghost`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value_json: '"x"' }),
  });
  assert.equal(noField.status, 400);

  // PATCH 成功
  const ok = await ctx.request(`/api/worlds/${world.id}/state-values/climate`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value_json: '"温和"' }),
  });
  assert.equal(ok.status, 200);

  // reset 不存在世界 → 404
  const resetFail = await ctx.request('/api/worlds/no-such/state-values/reset', { method: 'POST' });
  assert.equal(resetFail.status, 404);

  // reset 成功
  const reset = await ctx.request(`/api/worlds/${world.id}/state-values/reset`, { method: 'POST' });
  assert.equal(reset.status, 200);
});

// ─── persona-state-values（同形）────────────────────────────────────

test('persona-state-values: GET / PATCH(校验/404) / reset', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'persona-值-世界' });
  insertPersonaStateField(ctx.sandbox.db, world.id, {
    field_key: 'gold', label: '金币', type: 'number', allow_empty: 0, default_value: '0',
  });

  const list = await ctx.request(`/api/worlds/${world.id}/persona-state-values`);
  assert.equal(list.status, 200);

  const bad = await ctx.request(`/api/worlds/${world.id}/persona-state-values/gold`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(bad.status, 400);

  const ok = await ctx.request(`/api/worlds/${world.id}/persona-state-values/gold`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value_json: '120' }),
  });
  assert.equal(ok.status, 200);

  const reset = await ctx.request(`/api/worlds/${world.id}/persona-state-values/reset`, { method: 'POST' });
  assert.equal(reset.status, 200);

  const resetFail = await ctx.request('/api/worlds/no-such/persona-state-values/reset', { method: 'POST' });
  assert.equal(resetFail.status, 404);
});

// ─── character-state-values（同形）──────────────────────────────────

test('character-state-values: GET / PATCH(校验/404) / reset', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'char-值-世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: 'char' });
  insertCharacterStateField(ctx.sandbox.db, world.id, {
    field_key: 'mp', label: 'MP', type: 'number', allow_empty: 0, default_value: '50',
  });

  const list = await ctx.request(`/api/characters/${character.id}/state-values`);
  assert.equal(list.status, 200);

  const bad = await ctx.request(`/api/characters/${character.id}/state-values/mp`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(bad.status, 400);

  const noChar = await ctx.request('/api/characters/no-such/state-values/mp', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value_json: '10' }),
  });
  assert.equal(noChar.status, 404);

  const ok = await ctx.request(`/api/characters/${character.id}/state-values/mp`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value_json: '10' }),
  });
  assert.equal(ok.status, 200);

  const reset = await ctx.request(`/api/characters/${character.id}/state-values/reset`, { method: 'POST' });
  assert.equal(reset.status, 200);

  const resetFail = await ctx.request('/api/characters/no-such/state-values/reset', { method: 'POST' });
  assert.equal(resetFail.status, 404);
});
