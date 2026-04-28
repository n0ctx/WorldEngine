import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';
import {
  insertCharacter,
  insertCharacterStateField,
  insertPersonaStateField,
  insertSession,
  insertSessionCharacterStateValue,
  insertSessionPersonaStateValue,
  insertSessionWorldStateValue,
  insertWorld,
  insertWorldStateField,
} from '../helpers/fixtures.js';

const ctx = createRouteTestContext('routes-session-state-values');
after(() => ctx.close());

test('GET /api/sessions/:sessionId/state-values 返回三层值；会话不存在 404', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'sess-state-世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: 'c' });
  insertWorldStateField(ctx.sandbox.db, world.id, { field_key: 'w1', label: 'W1', type: 'text' });
  insertPersonaStateField(ctx.sandbox.db, world.id, { field_key: 'p1', label: 'P1', type: 'text' });
  insertCharacterStateField(ctx.sandbox.db, world.id, { field_key: 'c1', label: 'C1', type: 'text' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });

  const res = await ctx.request(`/api/sessions/${session.id}/state-values`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.world));
  assert.ok(Array.isArray(data.persona));
  assert.ok(Array.isArray(data.character));

  const notFound = await ctx.request('/api/sessions/no-such/state-values');
  assert.equal(notFound.status, 404);
});

test('GET state-values 在无 worldId 时返回空集合', async () => {
  const session = insertSession(ctx.sandbox.db, { character_id: null, world_id: null });
  const res = await ctx.request(`/api/sessions/${session.id}/state-values`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data, { world: [], persona: [], character: [] });
});

test('PATCH world/persona/character state-value 写入 session 层值', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'sess-patch' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: 'c-patch' });
  insertWorldStateField(ctx.sandbox.db, world.id, { field_key: 'wf', label: 'WF', type: 'text' });
  insertPersonaStateField(ctx.sandbox.db, world.id, { field_key: 'pf', label: 'PF', type: 'text' });
  insertCharacterStateField(ctx.sandbox.db, world.id, { field_key: 'cf', label: 'CF', type: 'text' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });

  const w = await ctx.request(`/api/sessions/${session.id}/world-state-values/wf`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value_json: '"晴"' }),
  });
  assert.equal(w.status, 200);

  const p = await ctx.request(`/api/sessions/${session.id}/persona-state-values/pf`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value_json: '"愉快"' }),
  });
  assert.equal(p.status, 200);

  const c = await ctx.request(`/api/sessions/${session.id}/character-state-values/${character.id}/cf`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value_json: '"防御"' }),
  });
  assert.equal(c.status, 200);
});

test('PATCH world-state-values 在会话不存在/无 worldId 时返回 404/400', async () => {
  const sessionNoWorld = insertSession(ctx.sandbox.db, { character_id: null, world_id: null });
  const r400 = await ctx.request(`/api/sessions/${sessionNoWorld.id}/world-state-values/x`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value_json: 'null' }),
  });
  assert.equal(r400.status, 400);

  const r404 = await ctx.request('/api/sessions/no-such/world-state-values/x', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value_json: 'null' }),
  });
  assert.equal(r404.status, 404);
});

test('PATCH persona-state-values 同样校验 404 / 400', async () => {
  const sessionNoWorld = insertSession(ctx.sandbox.db, { character_id: null, world_id: null });
  const r400 = await ctx.request(`/api/sessions/${sessionNoWorld.id}/persona-state-values/x`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value_json: 'null' }),
  });
  assert.equal(r400.status, 400);

  const r404 = await ctx.request('/api/sessions/no-such/persona-state-values/x', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value_json: 'null' }),
  });
  assert.equal(r404.status, 404);
});

test('PATCH character-state-values 在 session 不存在时 404', async () => {
  const r = await ctx.request('/api/sessions/no-such/character-state-values/c-id/f', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value_json: 'null' }),
  });
  assert.equal(r.status, 404);
});

test('DELETE world/persona/character session-state-values 清空运行时', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'sess-del' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: 'c-del' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });

  insertSessionWorldStateValue(ctx.sandbox.db, session.id, world.id, { field_key: 'w', runtime_value_json: '"x"' });
  insertSessionPersonaStateValue(ctx.sandbox.db, session.id, world.id, { field_key: 'p', runtime_value_json: '"y"' });
  insertSessionCharacterStateValue(ctx.sandbox.db, session.id, character.id, { field_key: 'c', runtime_value_json: '"z"' });

  const dw = await ctx.request(`/api/sessions/${session.id}/world-state-values`, { method: 'DELETE' });
  assert.equal(dw.status, 200);
  const dp = await ctx.request(`/api/sessions/${session.id}/persona-state-values`, { method: 'DELETE' });
  assert.equal(dp.status, 200);
  const dc = await ctx.request(`/api/sessions/${session.id}/character-state-values`, { method: 'DELETE' });
  assert.equal(dc.status, 200);

  const counts = {
    w: ctx.sandbox.db.prepare('SELECT COUNT(*) AS c FROM session_world_state_values WHERE session_id = ?').get(session.id).c,
    p: ctx.sandbox.db.prepare('SELECT COUNT(*) AS c FROM session_persona_state_values WHERE session_id = ?').get(session.id).c,
    c: ctx.sandbox.db.prepare('SELECT COUNT(*) AS c FROM session_character_state_values WHERE session_id = ?').get(session.id).c,
  };
  assert.deepEqual(counts, { w: 0, p: 0, c: 0 });
});

test('DELETE world/persona/character session-state-values 在会话不存在时 404', async () => {
  for (const path of [
    '/api/sessions/no-such/world-state-values',
    '/api/sessions/no-such/persona-state-values',
    '/api/sessions/no-such/character-state-values',
  ]) {
    const res = await ctx.request(path, { method: 'DELETE' });
    assert.equal(res.status, 404, path);
  }
});

test('GET / DELETE /api/sessions/:s/characters/:c/state-values', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'sess-single-char' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: 'sc' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });

  const get = await ctx.request(`/api/sessions/${session.id}/characters/${character.id}/state-values`);
  assert.equal(get.status, 200);

  const get404 = await ctx.request(`/api/sessions/${session.id}/characters/no-such/state-values`);
  assert.equal(get404.status, 404);

  const del = await ctx.request(`/api/sessions/${session.id}/characters/${character.id}/state-values`, {
    method: 'DELETE',
  });
  assert.equal(del.status, 200);

  // 删除时角色不存在则返回空数组（不报错）
  const delNoChar = await ctx.request(`/api/sessions/${session.id}/characters/no-such/state-values`, {
    method: 'DELETE',
  });
  assert.equal(delNoChar.status, 200);
  const data = await delNoChar.json();
  assert.deepEqual(data, []);
});
