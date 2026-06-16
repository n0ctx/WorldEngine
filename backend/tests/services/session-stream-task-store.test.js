import test from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImportUncached } from '../helpers/test-env.js';
import {
  insertCharacter,
  insertSession,
  insertWorld,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('session-stream-task-store');
sandbox.setEnv();

const store = await freshImportUncached('backend/services/session-stream-task-store.js');

function createChatSessionFixture() {
  const world = insertWorld(sandbox.db, { name: '测试世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '测试角色' });
  const session = insertSession(sandbox.db, { character_id: character.id, mode: 'chat' });
  return { world, character, session };
}

function createWritingSessionFixture() {
  const world = insertWorld(sandbox.db, { name: '写作世界' });
  const session = insertSession(sandbox.db, { world_id: world.id, mode: 'writing' });
  return { world, session };
}

test('createSessionStreamTask 持久化并可按 session recover', () => {
  const { session } = createChatSessionFixture();
  const task = store.createSessionStreamTask({
    sessionId: session.id,
    mode: 'chat',
    messages: [{ id: 'user-1', role: 'user', content: 'hello' }],
  });
  store.emitSessionStreamEvent(session.id, { delta: 'abc' });

  const recovered = store.getRecoverableSessionStreamTask(session.id);
  assert.equal(recovered.id, task.id);
  assert.equal(recovered.streamingText, 'abc');
  assert.equal(recovered.status, 'streaming');
});

test('continue 场景把 delta 写入 continuingText', () => {
  const { session } = createWritingSessionFixture();
  store.createSessionStreamTask({
    sessionId: session.id,
    mode: 'writing',
    messages: [{ id: 'asst-1', role: 'assistant', content: '第一段' }],
    continuingMessageId: 'asst-1',
  });
  store.emitSessionStreamEvent(session.id, { delta: '续写内容' });

  const recovered = store.getRecoverableSessionStreamTask(session.id);
  assert.equal(recovered.continuingMessageId, 'asst-1');
  assert.equal(recovered.continuingText, '续写内容');
});

test('done 后任务转 postprocessing，再 complete 标记 completed', () => {
  const { session } = createChatSessionFixture();
  store.createSessionStreamTask({
    sessionId: session.id,
    mode: 'chat',
    messages: [{ id: 'user-1', role: 'user', content: 'hello' }],
  });
  store.emitSessionStreamEvent(session.id, {
    done: true,
    assistant: { id: 'asst-1', role: 'assistant', content: 'world' },
    options: ['继续'],
  });

  let snapshot = store.getSessionStreamTaskSnapshot(session.id);
  assert.equal(snapshot.status, 'postprocessing');
  assert.deepEqual(snapshot.options, ['继续']);
  assert.equal(snapshot.messages.at(-1).content, 'world');

  store.completeSessionStreamTask(session.id);
  snapshot = store.getSessionStreamTaskSnapshot(session.id);
  assert.equal(snapshot.status, 'completed');
});

test('并发创建同 session：新任务取代旧任务，旧 lifecycle 写入不再污染新任务', () => {
  const { session } = createChatSessionFixture();
  const taskA = store.createSessionStreamTask({
    sessionId: session.id,
    mode: 'chat',
    messages: [{ id: 'user-1', role: 'user', content: 'hello' }],
  });
  store.emitSessionStreamEvent(session.id, { delta: 'A-history' }, { taskId: taskA.id });

  // 第二个非终态 create（重连/取代场景）。
  const taskB = store.createSessionStreamTask({
    sessionId: session.id,
    mode: 'chat',
    messages: [{ id: 'user-1', role: 'user', content: 'hello' }],
  });

  assert.notEqual(taskB.id, taskA.id);
  assert.equal(taskB.gen, taskA.gen + 1);

  // recover 返回 B，且不含 A 的历史。
  const recovered = store.getRecoverableSessionStreamTask(session.id);
  assert.equal(recovered.id, taskB.id);
  assert.equal(recovered.streamingText, '');

  // A 的迟到 lifecycle 写入按 taskId 门控，no-op，不污染 B。
  store.emitSessionStreamEvent(session.id, { delta: 'A-late' }, { taskId: taskA.id });
  store.completeSessionStreamTask(session.id, taskA.id);
  const afterStale = store.getSessionStreamTaskSnapshot(session.id);
  assert.equal(afterStale.id, taskB.id);
  assert.equal(afterStale.status, 'streaming');
  assert.equal(afterStale.streamingText, '');

  // B 自己的写入正常生效。
  store.emitSessionStreamEvent(session.id, { delta: 'B-history' }, { taskId: taskB.id });
  assert.equal(store.getSessionStreamTaskSnapshot(session.id).streamingText, 'B-history');
});

test.after(() => {
  sandbox.cleanup();
});
