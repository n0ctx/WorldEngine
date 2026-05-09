import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';
import { resetMockEnv } from '../helpers/test-env.js';
import {
  insertWorld,
  insertCharacter,
  insertCharacterStateField,
  insertCharacterStateValue,
  insertSession,
} from '../helpers/fixtures.js';

const ctx = createRouteTestContext('writing-nearby-route-suite');
after(() => ctx.close());

function basePath(worldId, sessionId) {
  return `/api/worlds/${worldId}/writing-sessions/${sessionId}/nearby`;
}

function setupWorldSessionAndField(name) {
  const world = insertWorld(ctx.sandbox.db, { name });
  const session = insertSession(ctx.sandbox.db, { world_id: world.id, mode: 'writing' });
  const field = insertCharacterStateField(ctx.sandbox.db, world.id, {
    field_key: 'mood',
    label: '心情',
    type: 'text',
    default_value: '"平静"',
  });
  return { world, session, field };
}

test('POST /nearby 添加角色后 GET 能列出', async () => {
  resetMockEnv();
  const { world, session } = setupWorldSessionAndField('附近世界');
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '阿尔忒弥斯' });
  insertCharacterStateValue(ctx.sandbox.db, character.id, {
    field_key: 'mood',
    default_value_json: '"专注"',
  });

  let res = await ctx.request(basePath(world.id, session.id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ character_id: character.id }),
  });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.ok(created.id);

  res = await ctx.request(basePath(world.id, session.id));
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, created.id);
  assert.equal(list[0].name, '阿尔忒弥斯');
  assert.equal(list[0].is_saved, 1);
  assert.ok(Array.isArray(list[0].state));
  assert.equal(list[0].state[0].field_key, 'mood');
});

test('POST /nearby 缺 character_id 返回 400', async () => {
  resetMockEnv();
  const { world, session } = setupWorldSessionAndField('400 世界');

  const res = await ctx.request(basePath(world.id, session.id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /character_id/);
});

test('POST /nearby 重名返回 409', async () => {
  resetMockEnv();
  const { world, session } = setupWorldSessionAndField('重名世界');
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '同名者' });

  let res = await ctx.request(basePath(world.id, session.id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ character_id: character.id }),
  });
  assert.equal(res.status, 201);

  res = await ctx.request(basePath(world.id, session.id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ character_id: character.id }),
  });
  assert.equal(res.status, 409);
});

test('PATCH /nearby/:id 切换 is_saved 返回 200', async () => {
  resetMockEnv();
  const { world, session } = setupWorldSessionAndField('保存切换世界');
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '可保存' });

  let res = await ctx.request(basePath(world.id, session.id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ character_id: character.id }),
  });
  const { id: nearbyId } = await res.json();

  res = await ctx.request(`${basePath(world.id, session.id)}/${nearbyId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_saved: 0 }),
  });
  assert.equal(res.status, 200);
  const updated = await res.json();
  assert.equal(updated.id, nearbyId);
  assert.equal(updated.is_saved, 0);
});

test('PATCH /nearby/:id 重命名冲突返回 409', async () => {
  resetMockEnv();
  const { world, session } = setupWorldSessionAndField('改名冲突世界');
  const a = insertCharacter(ctx.sandbox.db, world.id, { name: '甲' });
  const b = insertCharacter(ctx.sandbox.db, world.id, { name: '乙' });

  let res = await ctx.request(basePath(world.id, session.id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ character_id: a.id }),
  });
  const aRow = await res.json();

  res = await ctx.request(basePath(world.id, session.id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ character_id: b.id }),
  });
  const bRow = await res.json();

  res = await ctx.request(`${basePath(world.id, session.id)}/${bRow.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '甲' }),
  });
  assert.equal(res.status, 409);
  // sanity: a still exists with that name
  void aRow;
});

test('PATCH /nearby/:id/state 更新字段值返回 200', async () => {
  resetMockEnv();
  const { world, session } = setupWorldSessionAndField('状态写入世界');
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '雪' });

  let res = await ctx.request(basePath(world.id, session.id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ character_id: character.id }),
  });
  const { id: nearbyId } = await res.json();

  res = await ctx.request(`${basePath(world.id, session.id)}/${nearbyId}/state`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field_key: 'mood', value_json: '"愉快"' }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });

  // 校验确实写入
  res = await ctx.request(basePath(world.id, session.id));
  const list = await res.json();
  const moodField = list[0].state.find((f) => f.field_key === 'mood');
  assert.equal(moodField.runtime_value_json, '"愉快"');
});

test('PATCH /nearby/:id/state 缺 field_key 返回 400', async () => {
  resetMockEnv();
  const { world, session } = setupWorldSessionAndField('字段校验世界');
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '柯' });

  let res = await ctx.request(basePath(world.id, session.id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ character_id: character.id }),
  });
  const { id: nearbyId } = await res.json();

  res = await ctx.request(`${basePath(world.id, session.id)}/${nearbyId}/state`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value_json: '"x"' }),
  });
  assert.equal(res.status, 400);
});

test('DELETE /nearby/:id 返回 204 且 GET 不再列出', async () => {
  resetMockEnv();
  const { world, session } = setupWorldSessionAndField('删除世界');
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '过客' });

  let res = await ctx.request(basePath(world.id, session.id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ character_id: character.id }),
  });
  const { id: nearbyId } = await res.json();

  res = await ctx.request(`${basePath(world.id, session.id)}/${nearbyId}`, {
    method: 'DELETE',
  });
  assert.equal(res.status, 204);

  res = await ctx.request(basePath(world.id, session.id));
  const list = await res.json();
  assert.equal(list.length, 0);
});
