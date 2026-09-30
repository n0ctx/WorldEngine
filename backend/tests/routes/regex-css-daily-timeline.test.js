import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createRouteTestContext } from '../helpers/http.js';
import {
  insertCharacter,
  insertDailyEntry,
  insertRegexRule,
  insertSession,
  insertTurnRecord,
  insertWorld,
} from '../helpers/fixtures.js';

const ctx = createRouteTestContext('routes-regex-css-daily-timeline');
after(() => ctx.close());

// ─── regex-rules ────────────────────────────────────────────────────

test('GET /api/regex-rules 支持 scope/worldId/mode 过滤', async () => {
  insertRegexRule(ctx.sandbox.db, { name: 'global-display', scope: 'display_only', mode: 'chat' });

  const all = await ctx.request('/api/regex-rules');
  assert.equal(all.status, 200);

  const filtered = await ctx.request('/api/regex-rules?scope=display_only&worldId=&mode=chat');
  assert.equal(filtered.status, 200);
});

test('POST /api/regex-rules 校验 name/pattern/scope/合法 scope', async () => {
  const noName = await ctx.request('/api/regex-rules', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(noName.status, 400);

  const noPattern = await ctx.request('/api/regex-rules', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'r1' }),
  });
  assert.equal(noPattern.status, 400);

  const noScope = await ctx.request('/api/regex-rules', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'r1', pattern: 'a' }),
  });
  assert.equal(noScope.status, 400);

  const bad = await ctx.request('/api/regex-rules', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'r1', pattern: 'a', scope: 'bogus' }),
  });
  assert.equal(bad.status, 400);

  const ok = await ctx.request('/api/regex-rules', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'ok-rule', pattern: 'foo', replacement: 'bar', scope: 'display_only' }),
  });
  assert.equal(ok.status, 201);
});

test('GET / PUT / DELETE /api/regex-rules/:id', async () => {
  const rule = insertRegexRule(ctx.sandbox.db, { name: '单条', pattern: 'a', scope: 'display_only' });

  const got = await ctx.request(`/api/regex-rules/${rule.id}`);
  assert.equal(got.status, 200);
  const got404 = await ctx.request('/api/regex-rules/no-such');
  assert.equal(got404.status, 404);

  const upd = await ctx.request(`/api/regex-rules/${rule.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '改名' }),
  });
  assert.equal(upd.status, 200);
  const upd404 = await ctx.request('/api/regex-rules/no-such', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x' }),
  });
  assert.equal(upd404.status, 404);

  const del = await ctx.request(`/api/regex-rules/${rule.id}`, { method: 'DELETE' });
  assert.equal(del.status, 204);
});

test('PUT /api/regex-rules/reorder 校验 items', async () => {
  const r1 = insertRegexRule(ctx.sandbox.db, { name: 'r1', pattern: 'a', scope: 'display_only' });

  const bad = await ctx.request('/api/regex-rules/reorder', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(bad.status, 400);

  const empty = await ctx.request('/api/regex-rules/reorder', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [] }),
  });
  assert.equal(empty.status, 400);

  const ok = await ctx.request('/api/regex-rules/reorder', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ id: r1.id, sort_order: 0 }] }),
  });
  assert.equal(ok.status, 200);
});

// ─── custom-css-snippets ────────────────────────────────────────────

test('custom-css-snippets 完整 CRUD + reorder', async () => {
  const list = await ctx.request('/api/custom-css-snippets');
  assert.equal(list.status, 200);
  const filtered = await ctx.request('/api/custom-css-snippets?mode=chat');
  assert.equal(filtered.status, 200);

  const noName = await ctx.request('/api/custom-css-snippets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '* {}' }),
  });
  assert.equal(noName.status, 400);

  const created = await ctx.request('/api/custom-css-snippets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'theme-1', content: 'body{color:red}' }),
  });
  assert.equal(created.status, 201);
  const snippet = await created.json();

  const got = await ctx.request(`/api/custom-css-snippets/${snippet.id}`);
  assert.equal(got.status, 200);
  const got404 = await ctx.request('/api/custom-css-snippets/no-such');
  assert.equal(got404.status, 404);

  const upd = await ctx.request(`/api/custom-css-snippets/${snippet.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'theme-改' }),
  });
  assert.equal(upd.status, 200);
  const upd404 = await ctx.request('/api/custom-css-snippets/no-such', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x' }),
  });
  assert.equal(upd404.status, 404);

  const reorderBad = await ctx.request('/api/custom-css-snippets/reorder', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(reorderBad.status, 400);
  const reorderEmpty = await ctx.request('/api/custom-css-snippets/reorder', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [] }),
  });
  assert.equal(reorderEmpty.status, 400);
  const reorderOk = await ctx.request('/api/custom-css-snippets/reorder', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ id: snippet.id, sort_order: 0 }] }),
  });
  assert.equal(reorderOk.status, 200);

  const del = await ctx.request(`/api/custom-css-snippets/${snippet.id}`, { method: 'DELETE' });
  assert.equal(del.status, 204);
});

// ─── daily-entries ──────────────────────────────────────────────────

test('GET /api/sessions/:sessionId/daily-entries 列表与 404', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '日记-世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '日记-角色' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  insertDailyEntry(ctx.sandbox.db, session.id, {
    date_str: '1000-01-01', date_display: '1000年1月1日', summary: 's1',
  });

  const ok = await ctx.request(`/api/sessions/${session.id}/daily-entries`);
  assert.equal(ok.status, 200);
  const data = await ok.json();
  assert.equal(data.items.length, 1);

  const notFound = await ctx.request('/api/sessions/no-such/daily-entries');
  assert.equal(notFound.status, 404);
});

test('GET /api/sessions/:sessionId/daily-entries/:dateStr 文件存在/不存在', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '日记-文件' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '日记-c' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });

  const noFile = await ctx.request(`/api/sessions/${session.id}/daily-entries/1000-01-01`);
  assert.equal(noFile.status, 404);

  const dailyDir = path.join(ctx.sandbox.root, 'daily', session.id);
  fs.mkdirSync(dailyDir, { recursive: true });
  fs.writeFileSync(path.join(dailyDir, '1000-01-01.md'), '# 内容');

  const ok = await ctx.request(`/api/sessions/${session.id}/daily-entries/1000-01-01`);
  assert.equal(ok.status, 200);
  const data = await ok.json();
  assert.match(data.content, /内容/);

  const noSession = await ctx.request('/api/sessions/no-such/daily-entries/1000-01-01');
  assert.equal(noSession.status, 404);
});

// ─── session-timeline ───────────────────────────────────────────────

test('GET /api/sessions/:sessionId/timeline 返回 turn_records 顺序', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'timeline-世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: 'timeline-c' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  insertTurnRecord(ctx.sandbox.db, session.id, { round_index: 0, summary: 's0' });
  insertTurnRecord(ctx.sandbox.db, session.id, { round_index: 1, summary: 's1' });

  const ok = await ctx.request(`/api/sessions/${session.id}/timeline`);
  assert.equal(ok.status, 200);
  const data = await ok.json();
  assert.equal(data.items[0].round_index, 0);
  assert.equal(data.items[1].round_index, 1);

  const notFound = await ctx.request('/api/sessions/no-such/timeline');
  assert.equal(notFound.status, 404);
});
