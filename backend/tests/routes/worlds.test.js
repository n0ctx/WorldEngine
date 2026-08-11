import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// backend/utils/proxy.js 把 globalThis.fetch 换成了 npm undici 包的 fetch（见该文件注释：
// Node 内置 fetch 与 node_modules/undici 是两个独立实例）。它内部用 `instanceof` 校验
// multipart body 是不是"自己认识的" FormData/Blob——用 Node 内置的 FormData 会校验失败，
// 被当成普通对象 stringify 成 text/plain 发出去，服务端收不到文件。这里改用同一个 undici
// 包的 FormData/Blob，与被替换后的 fetch 出自同一实例。
import { FormData } from 'undici';

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

// 1x1 白色 PNG，用于封面上传成功路径测试
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function tinyPngBlob() {
  return new Blob([Buffer.from(TINY_PNG_BASE64, 'base64')], { type: 'image/png' });
}

test('POST /api/worlds/:id/cover 成功时接受前端算出的 accent_color（accent_source 非 manual）', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'cover-accent-auto' });

  const form = new FormData();
  form.append('cover', tinyPngBlob(), 'cover.png');
  form.append('accent_color', '#a1b2c3');
  const res = await ctx.request(`/api/worlds/${world.id}/cover`, { method: 'POST', body: form });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.cover_path);
  assert.equal(body.accent_color, '#a1b2c3');
  assert.equal(body.accent_source, 'auto');
});

test('POST /api/worlds/:id/cover 主色来源为 manual 时，换封面不覆盖用户手工指定的主色', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'cover-accent-manual' });
  const setManual = await ctx.request(`/api/worlds/${world.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accent_color: '#ff0000', accent_source: 'manual' }),
  });
  assert.equal(setManual.status, 200);

  const form = new FormData();
  form.append('cover', tinyPngBlob(), 'cover.png');
  form.append('accent_color', '#a1b2c3'); // 前端仍会算并提交，但后端应忽略
  const res = await ctx.request(`/api/worlds/${world.id}/cover`, { method: 'POST', body: form });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.cover_path);
  assert.equal(body.accent_color, '#ff0000');
  assert.equal(body.accent_source, 'manual');
});
