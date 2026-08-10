import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createRouteTestContext } from '../helpers/http.js';
import {
  insertCharacter,
  insertMessage,
  insertPersona,
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

test('GET /api/sessions/:id/messages 返回该会话全部消息', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '消息-世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '消息-角色' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q1' });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a1' });

  const res = await ctx.request(`/api/sessions/${session.id}/messages`);
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

test('PUT /api/messages/:id 截断后会把表格记忆恢复到保留轮次快照', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'edit-table-世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: 'edit-table-角色' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'u1', created_at: 1 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a1', created_at: 2 });
  const editTarget = insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'u2 old', created_at: 3 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a2 future', created_at: 4 });

  const keptSnapshot = {
    tables: {
      relations: { rows: [], nextId: 1 },
      items: { rows: [{ id: 1, 物品: '旧钥匙' }], nextId: 2 },
      places: { rows: [], nextId: 1 },
      world: { rows: [], nextId: 1 },
    },
    archive: { relations: [], items: [], places: [], world: [] },
  };
  const futureSnapshot = {
    tables: {
      relations: { rows: [], nextId: 1 },
      items: { rows: [{ id: 1, 物品: '未来钥匙' }], nextId: 2 },
      places: { rows: [], nextId: 1 },
      world: { rows: [], nextId: 1 },
    },
    archive: { relations: [], items: [], places: [], world: [] },
  };
  ctx.sandbox.db.prepare(`
    INSERT INTO turn_records (id, session_id, round_index, summary, user_message_id, asst_message_id, state_snapshot, table_memory_snapshot, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('tm-edit-r1', session.id, 1, 'r1', null, null, null, JSON.stringify(keptSnapshot), 1);
  ctx.sandbox.db.prepare(`
    INSERT INTO turn_records (id, session_id, round_index, summary, user_message_id, asst_message_id, state_snapshot, table_memory_snapshot, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('tm-edit-r2', session.id, 2, 'r2', null, null, null, JSON.stringify(futureSnapshot), 2);

  const tableDir = path.join(ctx.sandbox.root, 'table_memory', session.id);
  fs.mkdirSync(tableDir, { recursive: true });
  fs.writeFileSync(path.join(tableDir, 'tables.json'), JSON.stringify(futureSnapshot), 'utf-8');

  const res = await ctx.request(`/api/messages/${editTarget.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'u2 new' }),
  });
  assert.equal(res.status, 200);
  const restored = JSON.parse(fs.readFileSync(path.join(tableDir, 'tables.json'), 'utf-8'));
  assert.deepEqual(restored, keptSnapshot);
});

test('GET /api/worlds/:id/latest-chat-session 在无会话时 404', async () => {
  const res = await ctx.request('/api/worlds/no-such-world/latest-chat-session');
  assert.equal(res.status, 404);
});

test('GET /api/worlds/:worldId/timeline 混编 chat/writing 会话，按 updated_at 降序，附带最后一条消息片段', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '时间线-世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '时间线-角色' });
  const persona = insertPersona(ctx.sandbox.db, world.id, { name: '时间线-玩家' });

  const chatSession = insertSession(ctx.sandbox.db, {
    character_id: character.id, world_id: null, mode: 'chat', updated_at: 1000,
  });
  insertMessage(ctx.sandbox.db, chatSession.id, { role: 'assistant', content: `   带首尾空白的一段${'很长'.repeat(40)}的回复内容   `, created_at: 10 });

  const writingSession = insertSession(ctx.sandbox.db, {
    character_id: null, world_id: world.id, persona_id: persona.id, mode: 'writing', title: '写作标题', updated_at: 2000,
  });
  insertMessage(ctx.sandbox.db, writingSession.id, { role: 'user', content: '写作片段', created_at: 20 });

  // 另一个世界的会话不应混入
  const otherWorld = insertWorld(ctx.sandbox.db, { name: '时间线-无关世界' });
  const otherCharacter = insertCharacter(ctx.sandbox.db, otherWorld.id, { name: '无关角色' });
  insertSession(ctx.sandbox.db, { character_id: otherCharacter.id, world_id: null, mode: 'chat', updated_at: 3000 });

  const res = await ctx.request(`/api/worlds/${world.id}/timeline`);
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.equal(list.length, 2);

  // updated_at 降序：writing(2000) 在前，chat(1000) 在后
  assert.equal(list[0].id, writingSession.id);
  assert.equal(list[0].mode, 'writing');
  assert.equal(list[0].title, '写作标题');
  assert.equal(list[0].last_message, '写作片段');

  assert.equal(list[1].id, chatSession.id);
  assert.equal(list[1].mode, 'chat');
  assert.equal(list[1].character_id, character.id);
  // 首尾空白裁剪 + 超长截断（60 字符上限）
  assert.ok(!list[1].last_message.startsWith(' '));
  assert.ok(list[1].last_message.endsWith('…'));
  assert.ok(list[1].last_message.length <= 61);
});

test('GET /api/worlds/:worldId/timeline 该世界暂无会话时返回空数组', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '时间线-空世界' });
  const res = await ctx.request(`/api/worlds/${world.id}/timeline`);
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.deepEqual(list, []);
});

test('GET /api/worlds/:worldId/timeline 最后一条消息剥干净思考块后为空时，回溯上一条有正文的消息', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '时间线-思考块世界' });
  const persona = insertPersona(ctx.sandbox.db, world.id, { name: '玩家' });
  const session = insertSession(ctx.sandbox.db, { character_id: null, world_id: world.id, persona_id: persona.id, mode: 'writing', updated_at: 1000 });

  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: '真正的正文内容', created_at: 10 });
  // 最后一条消息整条都是思考块，洗干净后应为空，需要回溯到上一条
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: '<think>元指令检查：无伦理限制</think>', created_at: 20 });

  const res = await ctx.request(`/api/worlds/${world.id}/timeline`);
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.equal(list.length, 1);
  assert.equal(list[0].last_message, '真正的正文内容');
});

test('GET /api/worlds/:worldId/timeline 会话所有消息洗干净后都为空时，last_message 为 null', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '时间线-全空世界' });
  const persona = insertPersona(ctx.sandbox.db, world.id, { name: '玩家' });
  const session = insertSession(ctx.sandbox.db, { character_id: null, world_id: world.id, persona_id: persona.id, mode: 'writing', updated_at: 1000 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: '<think>只有规划</think>', created_at: 10 });

  const res = await ctx.request(`/api/worlds/${world.id}/timeline`);
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.equal(list.length, 1);
  assert.equal(list[0].last_message, null);
});

test('GET /api/worlds/:worldId/timeline writing 会话按当前激活的 persona 过滤，不显示其他 persona 的写作会话', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '时间线-多玩家世界' });
  // created_at 必须显式错开：回退查询按 `created_at ASC, id ASC` 取第一条，
  // 两个 persona 落在同一毫秒时由随机 UUID 决胜，测试会间歇性失败。
  const personaA = insertPersona(ctx.sandbox.db, world.id, { name: '玩家A', created_at: 1000 });
  const personaB = insertPersona(ctx.sandbox.db, world.id, { name: '玩家B', created_at: 2000 });

  // 世界未显式设置 active_persona_id 时，回退到最早创建的 persona（personaA）
  const sessionA = insertSession(ctx.sandbox.db, {
    character_id: null, world_id: world.id, persona_id: personaA.id, mode: 'writing', title: 'A的故事', updated_at: 2000,
  });
  insertSession(ctx.sandbox.db, {
    character_id: null, world_id: world.id, persona_id: personaB.id, mode: 'writing', title: 'B的故事', updated_at: 3000,
  });

  const res = await ctx.request(`/api/worlds/${world.id}/timeline`);
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, sessionA.id);
});

test('GET /api/worlds/:worldId/timeline 世界下没有任何 persona 时，writing 会话一条都不显示', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '时间线-无玩家世界' });
  insertSession(ctx.sandbox.db, { character_id: null, world_id: world.id, mode: 'writing', title: '孤儿写作会话', updated_at: 1000 });

  const res = await ctx.request(`/api/worlds/${world.id}/timeline`);
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.deepEqual(list, []);
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
