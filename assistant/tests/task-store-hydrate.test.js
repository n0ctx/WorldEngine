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
    id, status, context_json, messages_json, pending_user_messages_json,
    model_context_json, created_at, current_step_id, error, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const seeds = [
  { id: 'task-aaaaaaa1', status: 'completed', context: {}, messages: [], pendingUserMessages: [], createdAt: 1, currentStepId: null, modelContext: null, error: null, updatedAt: now },
  { id: 'task-aaaaaaa2', status: 'failed', context: {}, messages: [], pendingUserMessages: [], createdAt: 1, currentStepId: null, modelContext: null, error: 'boom', updatedAt: now },
  { id: 'task-bbbbbbb1', status: 'executing', context: {}, messages: [{ id: 'm1', role: 'user', content: 'x' }], pendingUserMessages: [], createdAt: 1, currentStepId: 'step-1', modelContext: null, error: null, updatedAt: now },
  { id: 'task-bbbbbbb2', status: 'awaiting_approval', context: { worldId: 'w' }, messages: [
    { id: 'call-1', role: 'tool_call', toolName: 'preview_card', status: 'running' },
    { id: 'step-1', role: 'step', stepId: 'step-1', title: '执行中', status: 'running' },
    { id: 'plan-doc-task-bbbbbbb2', role: 'plan_doc', content: '# plan' },
  ], pendingUserMessages: [], createdAt: 1, currentStepId: null, modelContext: null, error: null, updatedAt: now },
  { id: 'task-ccccccc1', status: 'paused', context: { worldId: 'w2' }, messages: [{ id: 'm2', role: 'assistant', content: 'pending' }], pendingUserMessages: ['继续'], createdAt: 2, currentStepId: null, modelContext: { summary: 'old', summarizedUntilMessageId: 'm1', sourceMessageCount: 1, sourceChars: 3 }, error: null, updatedAt: now },
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
    s.currentStepId,
    s.error,
    s.updatedAt,
  );
}

fs.writeFileSync(path.join(sandbox.assistantStateDir, 'task-ddddddd1.json'), JSON.stringify({
  id: 'task-ddddddd1',
  status: 'completed',
  context: { worldId: 'legacy' },
  messages: [{ id: 'm3', role: 'user', content: 'legacy' }],
  pendingUserMessages: [],
  createdAt: 3,
  currentStepId: null,
  version: 1,
}));

const taskStore = await freshImportUncached('assistant/server/task-store.js');

after(() => {
  sandbox.cleanup();
});

test('hydrate: 终态任务原样保留', () => {
  assert.equal(taskStore.getTask('task-aaaaaaa1').status, 'completed');
  assert.equal(taskStore.getTask('task-aaaaaaa2').status, 'failed');
});

test('hydrate: executing 等不可恢复中的非终态转 failed', () => {
  const t1 = taskStore.getTask('task-bbbbbbb1');
  assert.equal(t1.status, 'failed');
  assert.equal(t1.error, 'interrupted by restart');
  // messages 与 currentStepId 等其他字段保留
  assert.equal(t1.messages.length, 1);
  assert.equal(t1.currentStepId, 'step-1');
});

test('hydrate: awaiting_approval / paused 保留为可恢复状态', () => {
  const t2 = taskStore.getTask('task-bbbbbbb2');
  assert.equal(t2.status, 'awaiting_approval');
  assert.deepEqual(t2.context, { worldId: 'w' });
  assert.equal(t2.messages[0].role, 'tool_call');
  assert.equal(t2.messages[0].status, 'error');
  assert.equal(t2.messages[1].role, 'step');
  assert.equal(t2.messages[1].status, 'error');
  assert.equal(t2.messages[2].role, 'plan_doc');

  const t3 = taskStore.getTask('task-ccccccc1');
  assert.equal(t3.status, 'paused');
  assert.deepEqual(t3.pendingUserMessages, ['继续']);
  assert.equal(t3.modelContext.summary, 'old');
});

test('hydrate: 转 failed 后同步写回数据库', () => {
  const raw = sandbox.db.prepare('SELECT status, error FROM assistant_tasks WHERE id = ?').get('task-bbbbbbb1');
  assert.equal(raw.status, 'failed');
  assert.equal(raw.error, 'interrupted by restart');
});

test('hydrate: 旧 JSON sidecar 导入到 SQLite', () => {
  const imported = sandbox.db.prepare('SELECT status, context_json FROM assistant_tasks WHERE id = ?').get('task-ddddddd1');
  assert.equal(imported.status, 'completed');
  assert.match(imported.context_json, /legacy/);
});
