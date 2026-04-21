import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';
import {
  insertCharacter,
  insertMessage,
  insertSession,
  insertTurnRecord,
  insertWorld,
} from '../helpers/fixtures.js';

function parseSsePayloads(raw) {
  return raw
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const line = block.split('\n').find((item) => item.startsWith('data: '));
      return line ? JSON.parse(line.slice(6)) : null;
    })
    .filter(Boolean);
}

const ctx = createRouteTestContext('writing-route-suite');

after(() => ctx.close());

test('写作会话角色管理与消息清空路由可正常工作', async () => {

  const world = insertWorld(ctx.sandbox.db, { name: '写作世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '席恩' });

  let res = await ctx.request(`/api/worlds/${world.id}/writing-sessions`, { method: 'POST' });
  assert.equal(res.status, 200);
  const session = await res.json();

  res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/characters/${character.id}`, {
    method: 'PUT',
  });
  assert.equal(res.status, 200);

  res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/characters`);
  const activeCharacters = await res.json();
  assert.equal(activeCharacters.length, 1);
  assert.equal(activeCharacters[0].id, character.id);

  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: '旧消息', created_at: 1 });
  insertTurnRecord(ctx.sandbox.db, session.id, { round_index: 1, summary: '旧摘要' });

  res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/messages`, {
    method: 'DELETE',
  });
  assert.equal(res.status, 200);

  const msgCount = ctx.sandbox.db.prepare('SELECT COUNT(*) AS c FROM messages WHERE session_id = ?').get(session.id).c;
  const turnCount = ctx.sandbox.db.prepare('SELECT COUNT(*) AS c FROM turn_records WHERE session_id = ?').get(session.id).c;
  assert.equal(msgCount, 0);
  assert.equal(turnCount, 0);
});

test('写作 generate 与 continue 路由会落库并返回 SSE', async () => {
  ctx.sandbox.writeConfig({
    ...ctx.sandbox.readConfig(),
    global_system_prompt: '系统提示',
  });

  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify(['第一句', '第二句']);

  const world = insertWorld(ctx.sandbox.db, { name: '流式世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '莲' });
  let res = await ctx.request(`/api/worlds/${world.id}/writing-sessions`, { method: 'POST' });
  const session = await res.json();

  await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/characters/${character.id}`, {
    method: 'PUT',
  });

  res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '继续写' }),
  });
  assert.equal(res.status, 200);
  const events = parseSsePayloads(await res.text());
  assert.ok(events.some((event) => event.type === 'memory_recall_start'));
  assert.ok(events.some((event) => event.done));

  const rows = ctx.sandbox.db.prepare(
    'SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC',
  ).all(session.id);
  assert.deepEqual(rows.map((row) => row.role), ['user', 'assistant']);
  assert.equal(rows[1].content, '第一句第二句');

  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify(['续写']);
  res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/continue`, {
    method: 'POST',
  });
  assert.equal(res.status, 200);
  const continueEvents = parseSsePayloads(await res.text());
  assert.ok(continueEvents.some((event) => event.done));

  const updatedAssistant = ctx.sandbox.db.prepare(
    `SELECT content FROM messages
     WHERE session_id = ? AND role = 'assistant'
     ORDER BY created_at DESC LIMIT 1`,
  ).get(session.id);
  assert.match(updatedAssistant.content, /第一句第二句/);
  assert.match(updatedAssistant.content, /续写/);
});

test('写作 regenerate 会删除 afterMessageId 之后的消息并清空后续 turn record', async () => {

  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify(['新的段落']);

  const world = insertWorld(ctx.sandbox.db, { name: '重生世界' });
  const session = insertSession(ctx.sandbox.db, { world_id: world.id, mode: 'writing' });
  const firstUser = insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: '第一段', created_at: 1 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: '第一答', created_at: 2 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: '第二段', created_at: 3 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: '第二答', created_at: 4 });
  insertTurnRecord(ctx.sandbox.db, session.id, { round_index: 1, summary: '第一轮' });
  insertTurnRecord(ctx.sandbox.db, session.id, { round_index: 2, summary: '第二轮' });

  const res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ afterMessageId: firstUser.id }),
  });
  assert.equal(res.status, 200);
  const events = parseSsePayloads(await res.text());
  assert.ok(events.some((event) => event.done));

  const rows = ctx.sandbox.db.prepare(
    'SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC',
  ).all(session.id);
  assert.deepEqual(rows.map((row) => row.role), ['user', 'assistant']);
  assert.equal(rows[1].content, '新的段落');

  const turnRecords = ctx.sandbox.db.prepare(
    'SELECT round_index FROM turn_records WHERE session_id = ? ORDER BY round_index ASC',
  ).all(session.id);
  assert.deepEqual(turnRecords, []);
});
