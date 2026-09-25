import { createTestSandbox } from '../../backend/tests/helpers/test-env.js';

const sandbox = createTestSandbox('assistant-task-store');
sandbox.setEnv();

import test from 'node:test';
import assert from 'node:assert/strict';

// 动态 import:避免 ESM hoist 把 task-store 抬到 env 注入之前,导致 hydrate() 污染真实 .temp/assistant/
const taskStore = await import('../server/task-store.js');

function freshTask(ctx = {}) {
  return taskStore.createTask({ context: ctx });
}

test('createTask 生成 task 并标准化 context', () => {
  const t = freshTask({ worldId: 'w1', characterId: 'c1' });
  assert.match(t.id, /^task-/);
  assert.equal(t.status, 'idle');
  assert.deepEqual(t.context, { worldId: 'w1', characterId: 'c1' });
  assert.deepEqual(t.messages, []);
  assert.deepEqual(t.pendingUserMessages, []);
  assert.equal(typeof t.createdAt, 'number');
  // context 默认空对象
  const t2 = taskStore.createTask();
  assert.deepEqual(t2.context, {});
});

test('getTask 返回已存在的 task；未知 id 返回 null', () => {
  const t = freshTask();
  assert.equal(taskStore.getTask(t.id), t);
  assert.equal(taskStore.getTask('not-exist'), null);
});

test('setStatus 仅在已有 task 上生效；status 不变时不报错', () => {
  const t = freshTask();
  taskStore.setStatus(t.id, 'running');
  assert.equal(t.status, 'running');
  taskStore.setStatus(t.id, 'running'); // 同状态
  assert.equal(t.status, 'running');
  // 未知 id 直接 no-op
  taskStore.setStatus('nope', 'completed');
});

test('appendMessage 自动盖 id，deleteMessage 与 truncateFrom 按 id 删除', () => {
  const t = freshTask();
  const a = taskStore.appendMessage(t.id, { role: 'user', content: 'a' });
  const b = taskStore.appendMessage(t.id, { role: 'assistant', content: 'b' });
  const c = taskStore.appendMessage(t.id, { id: 'fixed', role: 'user', content: 'c' });
  assert.equal(c.id, 'fixed');
  assert.equal(t.messages.length, 3);
  // delete 中间一条
  assert.equal(taskStore.deleteMessage(t.id, b.id), true);
  assert.equal(t.messages.length, 2);
  // 不存在的 id
  assert.equal(taskStore.deleteMessage(t.id, 'nope'), false);
  assert.equal(taskStore.deleteMessage('nope', b.id), false);
  // truncate 从 a 开始
  assert.equal(taskStore.truncateFrom(t.id, a.id), 2);
  assert.equal(t.messages.length, 0);
  assert.equal(taskStore.truncateFrom(t.id, 'nope'), -1);
  assert.equal(taskStore.truncateFrom('nope', a.id), -1);
  // 不存在 task 上 appendMessage 返回 null
  assert.equal(taskStore.appendMessage('nope', { role: 'user', content: 'x' }), null);
});

test('queueUserMessage / takeUserMessages 取出后清空', () => {
  const t = freshTask();
  taskStore.queueUserMessage(t.id, 'hello');
  taskStore.queueUserMessage(t.id, 'world');
  // 不存在 task 上 queue 不抛
  taskStore.queueUserMessage('nope', 'x');
  const taken = taskStore.takeUserMessages(t.id);
  assert.deepEqual(taken, ['hello', 'world']);
  assert.deepEqual(taskStore.takeUserMessages(t.id), []);
  assert.deepEqual(taskStore.takeUserMessages('nope'), []);
});

test('attachSse / emit / detachSse 推送事件并隔离失败客户端', () => {
  const t = freshTask();
  const events1 = [];
  const events2 = [];
  const res1 = { write: (line) => events1.push(line) };
  const res2 = {
    write: () => { throw new Error('client gone'); },
  };
  taskStore.attachSse(t.id, res1);
  taskStore.attachSse(t.id, res2);
  taskStore.emit(t.id, { type: 'hello', taskId: t.id });
  assert.equal(events1.length, 1);
  assert.match(events1[0], /"type":"hello"/);
  // 没有订阅者的 task 不报错
  taskStore.emit('nope', { type: 'noop' });
  // detach 后再 emit 不会再写
  taskStore.detachSse(t.id, res1);
  taskStore.detachSse(t.id, res2);
  taskStore.emit(t.id, { type: 'after-detach' });
  assert.equal(events1.length, 1);
});

test('emit 持久化工具调用记录（含操作对象与失败原因）', () => {
  const t = freshTask();
  taskStore.emit(t.id, { type: 'tool_call_started', callId: 'call-1', toolName: 'read', summary: 'world' });
  taskStore.emit(t.id, { type: 'tool_call_completed', callId: 'call-1', toolName: 'read', success: true });
  taskStore.emit(t.id, { type: 'tool_call_started', callId: 'call-2', toolName: 'update', summary: 'entry:e1', target: 'entry' });
  taskStore.emit(t.id, { type: 'tool_call_completed', callId: 'call-2', toolName: 'update', success: false, error: 'boom' });

  assert.deepEqual(
    t.messages.map((m) => [m.id, m.toolName, m.summary, m.status, m.error ?? null]),
    [
      ['call-1', 'read', 'world', 'done', null],
      ['call-2', 'update', 'entry:e1', 'error', 'boom'],
    ],
  );
  const row = sandbox.db.prepare('SELECT messages_json FROM assistant_tasks WHERE id = ?').get(t.id);
  const persisted = JSON.parse(row.messages_json);
  assert.deepEqual(persisted.map((m) => [m.id, m.status]), [['call-1', 'done'], ['call-2', 'error']]);
});

test('endAllSse 关闭未结束的客户端流，已结束的不二次 end', () => {
  const t = freshTask();
  let endedA = false;
  let endedB = false;
  const a = { write: () => {}, end: () => { endedA = true; }, writableEnded: false };
  const b = { write: () => {}, end: () => { endedB = true; }, writableEnded: true };
  taskStore.attachSse(t.id, a);
  taskStore.attachSse(t.id, b);
  taskStore.endAllSse(t.id);
  assert.equal(endedA, true);
  assert.equal(endedB, false);
  // 第二次调用：clients 已 clear，无 op
  taskStore.endAllSse(t.id);
  // 不存在 task 也不抛
  taskStore.endAllSse('nope');
});

test('endAllSse 在 res.end() 抛错时仍然继续', () => {
  const t = freshTask();
  const a = { write: () => {}, end: () => { throw new Error('boom'); }, writableEnded: false };
  taskStore.attachSse(t.id, a);
  assert.doesNotThrow(() => taskStore.endAllSse(t.id));
});

test('deleteTask 移除 task 与订阅者集合', () => {
  const t = freshTask();
  taskStore.attachSse(t.id, { write: () => {} });
  taskStore.deleteTask(t.id);
  assert.equal(taskStore.getTask(t.id), null);
  assert.equal(taskStore.__testables.sseClients.has(t.id), false);
});

test('buildTaskSnapshot 与 getLatestRecoverableTask 返回可恢复快照', () => {
  const oldTask = freshTask();
  taskStore.setStatus(oldTask.id, 'running');

  const latestTask = freshTask();
  taskStore.setStatus(latestTask.id, 'failed', { error: taskStore.__testables.RESTART_INTERRUPTED_ERROR });
  taskStore.appendMessage(latestTask.id, { role: 'user', content: 'hi' });

  const recovered = taskStore.getLatestRecoverableTask();
  assert.equal(recovered.id, latestTask.id);

  const snapshot = taskStore.buildTaskSnapshot(recovered);
  assert.equal(snapshot.messages[0].content, 'hi');
  assert.equal(snapshot.error, taskStore.__testables.RESTART_INTERRUPTED_ERROR);

  const completed = freshTask();
  taskStore.setStatus(completed.id, 'completed');
  assert.notEqual(taskStore.getLatestRecoverableTask()?.id, completed.id, '已完成任务不可恢复');
});

test('getLatestRecoverableTask 严格按 context 隔离，无匹配返回 null', () => {
  const a = freshTask({ worldId: 'world-A', characterId: null });
  const b = freshTask({ worldId: 'world-B', characterId: null });
  taskStore.setStatus(a.id, 'running');
  taskStore.setStatus(b.id, 'running');

  // 传入 world-A 上下文：应返回 a，不应跨上下文返回 b
  const recoveredA = taskStore.getLatestRecoverableTask({ worldId: 'world-A', characterId: null });
  assert.equal(recoveredA?.id, a.id);

  // 传入 world-C（无匹配）：必须返回 null，不再兜底
  const recoveredC = taskStore.getLatestRecoverableTask({ worldId: 'world-C', characterId: null });
  assert.equal(recoveredC, null);
});

test('listRecoverableTasks 排除指定 context，按 updatedAt 倒序返回其它任务', () => {
  const a = freshTask({ worldId: 'world-A', characterId: null });
  const b = freshTask({ worldId: 'world-B', characterId: null });
  taskStore.setStatus(a.id, 'running');
  taskStore.setStatus(b.id, 'running');

  const others = taskStore.listRecoverableTasks({
    excludeContext: { worldId: 'world-A', characterId: null },
  });
  const ids = others.map((t) => t.id);
  assert.ok(ids.includes(b.id), '应包含 world-B 任务');
  assert.ok(!ids.includes(a.id), '不应包含当前上下文 world-A');
});

test.after(() => {
  sandbox.cleanup();
});
