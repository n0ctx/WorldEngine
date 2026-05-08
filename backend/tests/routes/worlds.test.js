import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createRouteTestContext } from '../helpers/http.js';
import { insertWorld } from '../helpers/fixtures.js';

const ctx = createRouteTestContext('routes-worlds-suite');
fs.mkdirSync(path.join(ctx.sandbox.uploadsDir, 'avatars'), { recursive: true });
after(() => ctx.close());

function jsonInit(method, body) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

test('GET /api/worlds 返回数组', async () => {
  insertWorld(ctx.sandbox.db, { name: '世界A' });
  insertWorld(ctx.sandbox.db, { name: '世界B' });
  const res = await ctx.request('/api/worlds');
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.ok(Array.isArray(list));
  assert.ok(list.length >= 2);
});

test('POST /api/worlds 校验 name；成功返回 201', async () => {
  const bad1 = await ctx.request('/api/worlds', jsonInit('POST', {}));
  assert.equal(bad1.status, 400);
  const bad2 = await ctx.request('/api/worlds', jsonInit('POST', { name: '   ' }));
  assert.equal(bad2.status, 400);
  const bad3 = await ctx.request('/api/worlds', jsonInit('POST', { name: 123 }));
  assert.equal(bad3.status, 400);

  const ok = await ctx.request('/api/worlds', jsonInit('POST', { name: '新世界' }));
  assert.equal(ok.status, 201);
  const created = await ok.json();
  assert.ok(created.id);
  assert.equal(created.name, '新世界');
});

test('PUT /api/worlds/reorder 校验 items；成功返回 ok', async () => {
  const w1 = insertWorld(ctx.sandbox.db, { name: 'reorder-1' });
  const w2 = insertWorld(ctx.sandbox.db, { name: 'reorder-2' });

  const bad1 = await ctx.request('/api/worlds/reorder', jsonInit('PUT', {}));
  assert.equal(bad1.status, 400);
  const bad2 = await ctx.request('/api/worlds/reorder', jsonInit('PUT', { items: [] }));
  assert.equal(bad2.status, 400);
  const bad3 = await ctx.request('/api/worlds/reorder', jsonInit('PUT', { items: 'x' }));
  assert.equal(bad3.status, 400);

  const ok = await ctx.request('/api/worlds/reorder', jsonInit('PUT', {
    items: [
      { id: w1.id, sort_order: 1 },
      { id: w2.id, sort_order: 0 },
    ],
  }));
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.ok, true);
});

test('GET / PUT / DELETE /api/worlds/:id 命中与 404 分支', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'crud' });

  const get = await ctx.request(`/api/worlds/${world.id}`);
  assert.equal(get.status, 200);

  const getMiss = await ctx.request('/api/worlds/no-such');
  assert.equal(getMiss.status, 404);

  const put = await ctx.request(`/api/worlds/${world.id}`, jsonInit('PUT', { name: 'crud-2' }));
  assert.equal(put.status, 200);
  const updated = await put.json();
  assert.equal(updated.name, 'crud-2');

  const putMiss = await ctx.request('/api/worlds/no-such', jsonInit('PUT', { name: 'x' }));
  assert.equal(putMiss.status, 404);

  const del = await ctx.request(`/api/worlds/${world.id}`, { method: 'DELETE' });
  assert.equal(del.status, 204);

  const delMiss = await ctx.request('/api/worlds/no-such', { method: 'DELETE' });
  assert.equal(delMiss.status, 404);
});

test('POST /api/worlds/:id/sync-diary 命中与 404', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'sync-diary' });
  const ok = await ctx.request(`/api/worlds/${world.id}/sync-diary`, { method: 'POST' });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.ok, true);

  const miss = await ctx.request('/api/worlds/no-such/sync-diary', { method: 'POST' });
  assert.equal(miss.status, 404);
});

test('POST /api/worlds/clear-all-diaries 返回 ok', async () => {
  const res = await ctx.request('/api/worlds/clear-all-diaries', { method: 'POST' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test('POST /api/worlds/:id/cover 缺文件 400 / 世界不存在 404', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'cover' });

  const emptyForm = new FormData();
  const bad = await ctx.request(`/api/worlds/${world.id}/cover`, { method: 'POST', body: emptyForm });
  assert.equal(bad.status, 400);

  const emptyForm2 = new FormData();
  const miss = await ctx.request('/api/worlds/no-such/cover', { method: 'POST', body: emptyForm2 });
  assert.equal(miss.status, 404);
});
