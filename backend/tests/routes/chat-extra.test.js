import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';
import { freshImport } from '../helpers/test-env.js';
import { insertCharacter, insertMessage, insertSession, insertWorld } from '../helpers/fixtures.js';
import { resetMockEnv } from '../helpers/test-env.js';

const ctx = createRouteTestContext('chat-extra-route-suite', {
  global_system_prompt: '系统提示',
});
after(() => ctx.close());

function postJson(path, body) {
  return ctx.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

test('POST /chat：缺 content 或非字符串 → 400；session 不存在 → 404', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: '校验城' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '伊娜' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });

  const r1 = await postJson(`/api/sessions/${session.id}/chat`, {});
  assert.equal(r1.status, 400);

  const r2 = await postJson(`/api/sessions/${session.id}/chat`, { content: 12345 });
  assert.equal(r2.status, 400);

  const r3 = await postJson(`/api/sessions/${session.id}/chat`, { content: '' });
  assert.equal(r3.status, 400);

  const r4 = await postJson('/api/sessions/no-such-session/chat', { content: 'hi' });
  assert.equal(r4.status, 404);
});

test('POST /regenerate：session 不存在 → 404；afterMessageId 不存在 → 404', async () => {
  const world = insertWorld(ctx.sandbox.db, { name: 'regen 校验' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '阿尔忒' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });

  const r1 = await postJson('/api/sessions/no-such/regenerate', { afterMessageId: 'x' });
  assert.equal(r1.status, 404);

  const r2 = await postJson(`/api/sessions/${session.id}/regenerate`, { afterMessageId: 'no-msg' });
  assert.equal(r2.status, 404);
});

test('POST /continue：session 不存在 → 404', async () => {
  const r = await postJson('/api/sessions/ghost/continue');
  assert.equal(r.status, 404);
});

test('POST /edit-assistant：参数校验 + session 校验 + 成功路径', async () => {
  resetMockEnv();
  const world = insertWorld(ctx.sandbox.db, { name: '编辑城' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '编辑者' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q', created_at: 1 });
  const asst = insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a', created_at: 2 });

  const bad1 = await postJson(`/api/sessions/${session.id}/edit-assistant`, {});
  assert.equal(bad1.status, 400);
  const bad2 = await postJson(`/api/sessions/${session.id}/edit-assistant`, { messageId: asst.id });
  assert.equal(bad2.status, 400);
  const bad3 = await postJson(`/api/sessions/${session.id}/edit-assistant`, { messageId: asst.id, content: 12345 });
  assert.equal(bad3.status, 400);

  const miss = await postJson('/api/sessions/no-such/edit-assistant', { messageId: asst.id, content: '新' });
  assert.equal(miss.status, 404);

  const ok = await postJson(`/api/sessions/${session.id}/edit-assistant`, { messageId: asst.id, content: '新内容' });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.success, true);
  const row = ctx.sandbox.db.prepare('SELECT content FROM messages WHERE id = ?').get(asst.id);
  assert.equal(row.content, '新内容');
});

test('POST /edit-assistant：非最后一条 assistant 返回 409', async () => {
  resetMockEnv();
  const world = insertWorld(ctx.sandbox.db, { name: '编辑城2' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '编辑者2' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q1', created_at: 1 });
  const asst = insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a1', created_at: 2 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q2', created_at: 3 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a2', created_at: 4 });

  const res = await postJson(`/api/sessions/${session.id}/edit-assistant`, { messageId: asst.id, content: '改老的' });
  assert.equal(res.status, 409);

  const row = ctx.sandbox.db.prepare('SELECT content FROM messages WHERE id = ?').get(asst.id);
  assert.equal(row.content, 'a1', '被拒绝时内容不应被修改');
});

test('POST /edit-assistant：末尾是失败残留的 user 消息时返回 409', async () => {
  resetMockEnv();
  const world = insertWorld(ctx.sandbox.db, { name: '编辑城3' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '编辑者3' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q1', created_at: 1 });
  const asst = insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: 'a1', created_at: 2 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q2（失败残留）', created_at: 3 });

  const res = await postJson(`/api/sessions/${session.id}/edit-assistant`, { messageId: asst.id, content: '改老的' });
  assert.equal(res.status, 409);
});

test('POST /edit-assistant：开场白（无 user 消息）只改内容，不建 turn record', async () => {
  resetMockEnv();
  const world = insertWorld(ctx.sandbox.db, { name: '编辑城4' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '编辑者4' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  const opening = insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: '开场白', created_at: 1 });

  const res = await postJson(`/api/sessions/${session.id}/edit-assistant`, { messageId: opening.id, content: '改过的开场白' });
  assert.equal(res.status, 200);

  const row = ctx.sandbox.db.prepare('SELECT content FROM messages WHERE id = ?').get(opening.id);
  assert.equal(row.content, '改过的开场白');

  const records = ctx.sandbox.db.prepare('SELECT id FROM turn_records WHERE session_id = ?').all(session.id);
  assert.equal(records.length, 0, '开场白编辑不应建 turn record');
});

test('POST /edit-assistant：重做最后一轮时日记任务不因 isUpdate 被跳过', async () => {
  // editAssistant 用 turnRecordOpts: { isUpdate: true } 调 buildTurnPostgenTasks；
  // diary 任务已不再按 isUpdate 门控（§3.7），这里直接核对任务清单，与路由是否真正入队一致
  const { buildTurnPostgenTasks } = await freshImport('backend/app/shared/postgen/build-turn-postgen-tasks.js');
  const { chatMode } = await freshImport('backend/app/modes/chat-mode.js');

  const tasks = buildTurnPostgenTasks({
    mode: chatMode,
    sessionId: 'fake-session',
    worldId: 'fake-world',
    characterIds: [],
    session: { id: 'fake-session', title: '已有标题' },
    messages: [],
    turnRecordOpts: { isUpdate: true },
    includeSessionTitle: false,
    includeChapterTitle: false,
  });

  const diaryTask = tasks.find((task) => task.label === 'diary');
  assert.ok(diaryTask, '任务清单应包含 diary');
  assert.notEqual(diaryTask.condition, false, 'diary 任务不应被 isUpdate 门控跳过');
});

test('POST /retitle：session 不存在 → 404；正常路径返回 title', async () => {
  resetMockEnv();
  const miss = await postJson('/api/sessions/no-such/retitle');
  assert.equal(miss.status, 404);

  const world = insertWorld(ctx.sandbox.db, { name: '改名城' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '改名者' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q', created_at: 1 });
  insertMessage(ctx.sandbox.db, session.id, { role: 'assistant', content: '<think>思考</think>答', created_at: 2 });

  process.env.MOCK_LLM_COMPLETE = '<think>x</think>新「标题」';
  const ok = await postJson(`/api/sessions/${session.id}/retitle`);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(typeof body.title, 'string');
  assert.doesNotMatch(body.title, /[「」"']/);
});

test('POST /retitle：LLM 返回空时返回 title:null', async () => {
  resetMockEnv();
  const world = insertWorld(ctx.sandbox.db, { name: '空标题城' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '空' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q', created_at: 1 });

  process.env.MOCK_LLM_COMPLETE = '';
  const ok = await postJson(`/api/sessions/${session.id}/retitle`);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.title, null);
});

test('POST /retitle：LLM 抛错时返回 500', async () => {
  resetMockEnv();
  const world = insertWorld(ctx.sandbox.db, { name: '错误城' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: 'X' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q', created_at: 1 });

  process.env.MOCK_LLM_COMPLETE_ERROR = 'llm dead';
  const r = await postJson(`/api/sessions/${session.id}/retitle`);
  assert.equal(r.status, 500);
});

test('POST /chat：message:user:saved hook 可拿到已持久化的附件路径', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify([]);
  const { registerHook } = await freshImport('backend/hooks/hook-registry.js');

  const world = insertWorld(ctx.sandbox.db, { name: '附件城' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '文件观察者' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  let savedPayload = null;

  registerHook('message:user:saved', async (payload) => {
    if (payload.sessionId === session.id) {
      savedPayload = payload;
    }
  }, { label: 'message-user-saved-attachments-test' });

  const res = await postJson(`/api/sessions/${session.id}/chat`, {
    content: '看图',
    attachments: [{
      type: 'image',
      mimeType: 'image/png',
      data: Buffer.from('fake-png').toString('base64'),
    }],
  });
  assert.equal(res.status, 200);
  await res.text();

  assert.ok(savedPayload);
  assert.equal(savedPayload.message.id.length > 0, true);
  assert.deepEqual(savedPayload.message.attachments, [`attachments/${savedPayload.message.id}_0.png`]);

  const row = ctx.sandbox.db.prepare('SELECT attachments FROM messages WHERE id = ?').get(savedPayload.message.id);
  assert.equal(row.attachments, JSON.stringify([`attachments/${savedPayload.message.id}_0.png`]));
});

test('POST /impersonate：session 不存在 → 404；缺 character/world → 400；正常返回 content', async () => {
  resetMockEnv();
  const r1 = await postJson('/api/sessions/ghost/impersonate');
  assert.equal(r1.status, 404);

  // 不挂角色的 session
  const orphan = insertSession(ctx.sandbox.db, { character_id: null, world_id: null });
  const r2 = await postJson(`/api/sessions/${orphan.id}/impersonate`);
  assert.equal(r2.status, 400);

  // 正常路径
  const world = insertWorld(ctx.sandbox.db, { name: '代入城' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '代入者' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  insertMessage(ctx.sandbox.db, session.id, { role: 'user', content: 'q', created_at: 1 });

  process.env.MOCK_LLM_COMPLETE = '<think>X</think>这是用户想说的话';
  const ok = await postJson(`/api/sessions/${session.id}/impersonate`);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.match(body.content, /用户想说/);
  assert.doesNotMatch(body.content, /<think>/);
});
