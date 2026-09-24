import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createTestSandbox, freshImportUncached } from '../../backend/tests/helpers/test-env.js';

const sandbox = createTestSandbox('assistant-task-hydrate');
sandbox.setEnv();

const now = Date.now();
const insert = sandbox.db.prepare(`
  INSERT INTO assistant_tasks (
    id, status, context_json, messages_json, pending_user_messages_json, model_context_json, created_at, error, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const seeds = [
  { id: 'task-aaaaaaa1', status: 'completed', context: {}, messages: [], pendingUserMessages: [], createdAt: 1, modelContext: null, error: null },
  { id: 'task-aaaaaaa2', status: 'failed', context: {}, messages: [], pendingUserMessages: [], createdAt: 1, modelContext: null, error: 'boom' },
  { id: 'task-bbbbbbb1', status: 'running', context: { worldId: 'w' }, messages: [
    { id: 'm1', role: 'user', content: 'x' },
    { id: 'call-1', role: 'tool_call', toolName: 'read', summary: 'world', status: 'running' },
  ], pendingUserMessages: ['继续'], createdAt: 1, modelContext: { summary: 'old', untilId: 'm1' }, error: null },
  // 旧版本遗留的审批 / 暂停状态：新版本没有这两种状态，按重启中断处理
  { id: 'task-bbbbbbb2', status: 'awaiting_approval', context: {}, messages: [], pendingUserMessages: [], createdAt: 1, modelContext: null, error: null },
  { id: 'task-ccccccc1', status: 'paused', context: {}, messages: [], pendingUserMessages: [], createdAt: 2, modelContext: null, error: null },
];
for (const s of seeds) {
  insert.run(
    s.id,
    s.status,
    JSON.stringify(s.context),
    JSON.stringify(s.messages),
    JSON.stringify(s.pendingUserMessages),
    s.modelContext ? JSON.stringify(s.modelContext) : null,
    s.createdAt,
    s.error,
    now,
  );
}

fs.writeFileSync(path.join(sandbox.assistantStateDir, 'task-ddddddd1.json'), JSON.stringify({
  id: 'task-ddddddd1',
  status: 'completed',
  context: { worldId: 'legacy' },
  messages: [{ id: 'm3', role: 'user', content: 'legacy' }],
  pendingUserMessages: [],
  createdAt: 3,
  version: 1,
}));

const taskStore = await freshImportUncached('assistant/server/task-store.js');
// hydrate 已从模块加载期改为显式调用（server.js 启动时触发），测试需手动触发
taskStore.hydrateAssistantTasks();

after(() => {
  sandbox.cleanup();
});

test('hydrate: 终态任务原样保留', () => {
  assert.equal(taskStore.getTask('task-aaaaaaa1').status, 'completed');
  assert.equal(taskStore.getTask('task-aaaaaaa2').status, 'failed');
});

test('hydrate: running 保留为可恢复状态，运行中的工具记录标为中断', () => {
  const t1 = taskStore.getTask('task-bbbbbbb1');
  assert.equal(t1.status, 'running');
  assert.equal(t1.error, undefined);
  assert.deepEqual(t1.context, { worldId: 'w' });
  assert.deepEqual(t1.pendingUserMessages, ['继续']);
  assert.equal(t1.modelContext.summary, 'old');
  assert.equal(t1.messages[1].status, 'error');

  const raw = sandbox.db.prepare('SELECT status, error FROM assistant_tasks WHERE id = ?').get('task-bbbbbbb1');
  assert.equal(raw.status, 'running');
  assert.equal(raw.error, null);
});

test('hydrate: 旧版审批 / 暂停状态转为重启中断，可继续恢复', () => {
  for (const id of ['task-bbbbbbb2', 'task-ccccccc1']) {
    const t = taskStore.getTask(id);
    assert.equal(t.status, 'failed');
    assert.equal(t.error, taskStore.RESTART_INTERRUPTED_ERROR);
  }
});

test('hydrate: 旧 JSON sidecar 导入到 SQLite', () => {
  const imported = sandbox.db.prepare('SELECT status, context_json FROM assistant_tasks WHERE id = ?').get('task-ddddddd1');
  assert.equal(imported.status, 'completed');
  assert.match(imported.context_json, /legacy/);
});
