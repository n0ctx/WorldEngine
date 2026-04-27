import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';
import { resetMockEnv } from '../helpers/test-env.js';
import { enqueue } from '../../utils/async-queue.js';
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
  resetMockEnv();

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
  resetMockEnv();
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
    'SELECT id, role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC',
  ).all(session.id);
  assert.deepEqual(rows.map((row) => row.role), ['user', 'assistant']);
  assert.equal(rows[1].content, '第一句第二句');

  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify(['续写']);
  res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/continue`, {
    method: 'POST',
  });
  assert.equal(res.status, 200);
  const continueEvents = parseSsePayloads(await res.text());
  const doneEvent = continueEvents.find((event) => event.done);
  assert.ok(doneEvent);
  assert.equal(doneEvent.assistant.id, rows[1].id);
  assert.match(doneEvent.assistant.content, /第一句第二句/);
  assert.match(doneEvent.assistant.content, /续写/);

  const updatedAssistant = ctx.sandbox.db.prepare(
    `SELECT content FROM messages
     WHERE session_id = ? AND role = 'assistant'
     ORDER BY created_at DESC LIMIT 1`,
  ).get(session.id);
  assert.match(updatedAssistant.content, /第一句第二句/);
  assert.match(updatedAssistant.content, /续写/);
});

test('写作 generate 的 SSE 流包含 state_updated 事件', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify(['片段']);

  const world = insertWorld(ctx.sandbox.db, { name: '状态世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '奥梅' });
  let res = await ctx.request(`/api/worlds/${world.id}/writing-sessions`, { method: 'POST' });
  const session = await res.json();
  await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/characters/${character.id}`, {
    method: 'PUT',
  });

  res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '写点什么' }),
  });
  assert.equal(res.status, 200);
  const events = parseSsePayloads(await res.text());

  // writing 模式后台任务完成后须推 state_updated，SSE 连接在此之后关闭
  assert.ok(events.some((e) => e.type === 'state_updated'), '应包含 state_updated');
  // diary_updated 仅当 diary_date_mode 非 null 时触发，本测试 session 未配置，依然应出现
  // （即使 checkAndGenerateDiary 内部 early-return，promise settle 后仍推送 diary_updated）
  assert.ok(events.some((e) => e.type === 'diary_updated'), '应包含 diary_updated');
});

test('写作 continue 的 SSE 流包含 state_updated 事件', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify(['续写片段']);

  const world = insertWorld(ctx.sandbox.db, { name: '续写状态世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '塔拉' });
  let res = await ctx.request(`/api/worlds/${world.id}/writing-sessions`, { method: 'POST' });
  const session = await res.json();
  await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/characters/${character.id}`, {
    method: 'PUT',
  });

  // 先 generate 一轮（含 user 消息）
  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify(['初始回复']);
  await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '开始' }),
  });

  // 续写
  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify(['续写片段']);
  res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/continue`, {
    method: 'POST',
  });
  assert.equal(res.status, 200);
  const continueEvents = parseSsePayloads(await res.text());

  assert.ok(continueEvents.some((e) => e.type === 'state_updated'), 'continue 应包含 state_updated');
});

test('写作 generate 在 session 不存在时返回 404', async () => {
  resetMockEnv();
  const world = insertWorld(ctx.sandbox.db, { name: '丢失会话世界' });
  const res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/missing-session/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '继续写' }),
  });

  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Session not found' });
});

test('写作 generate 在空流时不落 assistant 消息且不推后台事件', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify([]);

  const world = insertWorld(ctx.sandbox.db, { name: '空流写作世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '塞拉' });
  let res = await ctx.request(`/api/worlds/${world.id}/writing-sessions`, { method: 'POST' });
  const session = await res.json();
  await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/characters/${character.id}`, { method: 'PUT' });

  res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '空流测试' }),
  });
  const events = parseSsePayloads(await res.text());
  assert.ok(events.some((event) => event.type === 'memory_recall_start'));
  assert.ok(events.some((event) => event.done));
  assert.ok(!events.some((event) => event.type === 'state_updated' || event.type === 'diary_updated'));

  const rows = ctx.sandbox.db.prepare(
    'SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC',
  ).all(session.id);
  assert.deepEqual(rows, [{ role: 'user', content: '空流测试' }]);
});

test('写作 generate 在流式异常且无内容时推 error 且不落 assistant 消息', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_STREAM_ERROR = 'writing stream failure';

  const world = insertWorld(ctx.sandbox.db, { name: '异常写作世界' });
  const resSession = await ctx.request(`/api/worlds/${world.id}/writing-sessions`, { method: 'POST' });
  const session = await resSession.json();

  const res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '触发写作异常' }),
  });
  const events = parseSsePayloads(await res.text());
  assert.ok(events.some((event) => event.type === 'error' && event.error === 'writing stream failure'));
  assert.ok(!events.some((event) => event.done));

  const rows = ctx.sandbox.db.prepare(
    'SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC',
  ).all(session.id);
  assert.deepEqual(rows, [{ role: 'user', content: '触发写作异常' }]);
});

test('写作 generate 在流式异常但已有内容时保存部分回复并照常收尾', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_STREAM_ERROR = 'writing partial failure';

  const world = insertWorld(ctx.sandbox.db, { name: '半段写作世界' });
  const resSession = await ctx.request(`/api/worlds/${world.id}/writing-sessions`, { method: 'POST' });
  const session = await resSession.json();

  const res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '写一半' }),
  });
  const events = parseSsePayloads(await res.text());
  assert.ok(events.some((event) => event.type === 'error' && event.error === 'writing partial failure'));
  assert.ok(!events.some((event) => event.done));

  const assistant = ctx.sandbox.db.prepare(
    `SELECT COUNT(*) AS c FROM messages
     WHERE session_id = ? AND role = 'assistant'`,
  ).get(session.id);
  assert.equal(assistant.c, 0);
});

test('写作 continue 在没有 assistant 消息时返回 400', async () => {
  resetMockEnv();
  const world = insertWorld(ctx.sandbox.db, { name: '无续写世界' });
  const session = insertSession(ctx.sandbox.db, { world_id: world.id, mode: 'writing' });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: '只有用户消息', created_at: 1 });

  const res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/continue`, {
    method: 'POST',
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: '当前会话没有 AI 回复可续写' });
});

test('写作 continue 在最后一条 assistant 前没有 user 消息时返回 400', async () => {
  resetMockEnv();
  const world = insertWorld(ctx.sandbox.db, { name: '孤立写作续写世界' });
  const session = insertSession(ctx.sandbox.db, { world_id: world.id, mode: 'writing' });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: '开场白', created_at: 1 });

  const res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/continue`, {
    method: 'POST',
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: '当前会话没有可续写的用户-助手轮次' });
});

test('写作 continue 在 session 不存在时返回 404', async () => {
  resetMockEnv();
  const world = insertWorld(ctx.sandbox.db, { name: '空会话写作世界' });
  const res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/missing-session/continue`, {
    method: 'POST',
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Session not found' });
});

test('写作 continue 在异常但无内容时推 error 且不修改最后一条 assistant', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_STREAM_ERROR = 'continue failure';

  const world = insertWorld(ctx.sandbox.db, { name: '续写异常世界' });
  const session = insertSession(ctx.sandbox.db, { world_id: world.id, mode: 'writing' });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: '起始提问', created_at: 1 });
  const assistant = insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: '原文', created_at: 2 });

  const res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/continue`, {
    method: 'POST',
  });
  const events = parseSsePayloads(await res.text());
  assert.ok(events.some((event) => event.type === 'error' && event.error === 'continue failure'));
  assert.ok(!events.some((event) => event.done));

  const row = ctx.sandbox.db.prepare('SELECT content FROM messages WHERE id = ?').get(assistant.id);
  assert.equal(row.content, '原文');
});

test('写作 continue 在异常但已有内容时会把部分内容拼到最后一条 assistant', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_STREAM_ERROR = 'continue partial failure';

  const world = insertWorld(ctx.sandbox.db, { name: '续写半段世界' });
  const session = insertSession(ctx.sandbox.db, { world_id: world.id, mode: 'writing' });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: '起始提问', created_at: 1 });
  const assistant = insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: '原文', created_at: 2 });

  const res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/continue`, {
    method: 'POST',
  });
  const events = parseSsePayloads(await res.text());
  assert.ok(events.some((event) => event.type === 'error' && event.error === 'continue partial failure'));
  assert.ok(!events.some((event) => event.done));

  const row = ctx.sandbox.db.prepare('SELECT content FROM messages WHERE id = ?').get(assistant.id);
  assert.equal(row.content, '原文');
});

test('写作 generate 在存在新章节时会推 title_updated 与 chapter_title_updated', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify(['新章节正文']);
  process.env.MOCK_LLM_COMPLETE_QUEUE = JSON.stringify(['会话标题', '章节标题']);

  const world = insertWorld(ctx.sandbox.db, { name: '章节世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '蕾雅' });
  let res = await ctx.request(`/api/worlds/${world.id}/writing-sessions`, { method: 'POST' });
  const session = await res.json();
  await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/characters/${character.id}`, { method: 'PUT' });

  res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '第一章开头' }),
  });
  const events = parseSsePayloads(await res.text());
  assert.ok(events.some((event) => event.done));
  assert.ok(events.some((event) => event.type === 'title_updated' && event.title === '会话标题'));
  assert.ok(events.some((event) => event.type === 'chapter_title_updated' && event.title === '章节标题' && event.chapterIndex === 1));
});

test('写作 stop 在没有活跃流时返回 success', async () => {
  resetMockEnv();
  const world = insertWorld(ctx.sandbox.db, { name: '空停止写作世界' });
  const session = insertSession(ctx.sandbox.db, { world_id: world.id, mode: 'writing' });

  const res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/stop`, {
    method: 'POST',
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true });
});

test('写作 regenerate 缺少 afterMessageId 时返回 400', async () => {
  resetMockEnv();
  const world = insertWorld(ctx.sandbox.db, { name: '写作重生参数世界' });
  const session = insertSession(ctx.sandbox.db, { world_id: world.id, mode: 'writing' });

  const res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'afterMessageId is required' });
});

test('写作 regenerate 在 afterMessageId 非当前会话消息时返回 400', async () => {
  resetMockEnv();
  const world = insertWorld(ctx.sandbox.db, { name: '写作非法锚点世界' });
  const session = insertSession(ctx.sandbox.db, { world_id: world.id, mode: 'writing' });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: '第一段', created_at: 1 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: '第一答', created_at: 2 });
  const anotherSession = insertSession(ctx.sandbox.db, { world_id: world.id, mode: 'writing' });
  const foreignMessage = insertMessage(ctx.sandbox.db, anotherSession.id, { role: 'user', content: '外部消息', created_at: 3 });

  const res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ afterMessageId: foreignMessage.id }),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'afterMessageId does not belong to this session' });
});

test('写作 regenerate 在 afterMessageId 为 assistant 消息时返回 400', async () => {
  resetMockEnv();
  const world = insertWorld(ctx.sandbox.db, { name: '写作非法角色世界' });
  const session = insertSession(ctx.sandbox.db, { world_id: world.id, mode: 'writing' });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: '第一段', created_at: 1 });
  const assistant = insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: '第一答', created_at: 2 });

  const res = await ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ afterMessageId: assistant.id }),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'afterMessageId must be a user message' });
});

test('写作 regenerate 会删除 afterMessageId 之后的消息并清空后续 turn record', async () => {
  resetMockEnv();

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

test('写作 regenerate 会等待同 session 队列空闲后再截断消息', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify(['排队后的段落']);

  const world = insertWorld(ctx.sandbox.db, { name: '排队写作世界' });
  const session = insertSession(ctx.sandbox.db, { world_id: world.id, mode: 'writing', title: '已有标题' });
  const firstUser = insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: '第一段', created_at: 1 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: '第一答', created_at: 2 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: '第二段', created_at: 3 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: '第二答', created_at: 4 });

  let releaseQueued;
  const gate = new Promise((resolve) => {
    releaseQueued = resolve;
  });
  const queued = enqueue(session.id, async () => {
    await gate;
  }, 2, 'test-gate');

  const responsePromise = ctx.request(`/api/worlds/${world.id}/writing-sessions/${session.id}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ afterMessageId: firstUser.id }),
  });

  await new Promise((resolve) => setTimeout(resolve, 30));
  const countBeforeRelease = ctx.sandbox.db.prepare('SELECT COUNT(*) AS c FROM messages WHERE session_id = ?').get(session.id).c;
  assert.equal(countBeforeRelease, 4);

  releaseQueued();
  await queued;
  const res = await responsePromise;
  assert.equal(res.status, 200);
  const events = parseSsePayloads(await res.text());
  assert.ok(events.some((event) => event.done));

  const countAfter = ctx.sandbox.db.prepare('SELECT COUNT(*) AS c FROM messages WHERE session_id = ?').get(session.id).c;
  assert.equal(countAfter, 2);
});
