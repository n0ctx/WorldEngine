import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'we-hydrate-'));
process.env.ASSISTANT_STATE_DIR = dir;

// 预先写入 4 个 task 到磁盘:终态 2 个 + 非终态 2 个
const seeds = [
  { id: 'task-aaaaaaa1', status: 'completed', context: {}, messages: [], pendingUserMessages: [], createdAt: 1, currentStepId: null, version: 1 },
  { id: 'task-aaaaaaa2', status: 'failed',    context: {}, messages: [], pendingUserMessages: [], createdAt: 1, currentStepId: null, version: 1 },
  { id: 'task-bbbbbbb1', status: 'executing', context: {}, messages: [{ id: 'm1', role: 'user', content: 'x' }], pendingUserMessages: [], createdAt: 1, currentStepId: 'step-1', version: 1 },
  { id: 'task-bbbbbbb2', status: 'awaiting_approval', context: { worldId: 'w' }, messages: [], pendingUserMessages: [], createdAt: 1, currentStepId: null, version: 1 },
];
for (const s of seeds) {
  fs.writeFileSync(path.join(dir, `${s.id}.json`), JSON.stringify(s));
}

// 在 seed 完成之后再 import,触发模块加载期的 hydrate
const taskStore = await import('../server/task-store.js');

test.after(() => {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  delete process.env.ASSISTANT_STATE_DIR;
});

test('hydrate: 终态任务原样保留', () => {
  assert.equal(taskStore.getTask('task-aaaaaaa1').status, 'completed');
  assert.equal(taskStore.getTask('task-aaaaaaa2').status, 'failed');
});

test('hydrate: executing/awaiting_approval 等非终态全部转 failed', () => {
  const t1 = taskStore.getTask('task-bbbbbbb1');
  assert.equal(t1.status, 'failed');
  assert.equal(t1.error, 'interrupted by restart');
  // messages 与 currentStepId 等其他字段保留
  assert.equal(t1.messages.length, 1);
  assert.equal(t1.currentStepId, 'step-1');

  const t2 = taskStore.getTask('task-bbbbbbb2');
  assert.equal(t2.status, 'failed');
  assert.equal(t2.error, 'interrupted by restart');
  assert.deepEqual(t2.context, { worldId: 'w' });
});

test('hydrate: 转 failed 后同步写回磁盘(下次重启读到的是 failed)', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'task-bbbbbbb1.json'), 'utf8'));
  assert.equal(raw.status, 'failed');
  assert.equal(raw.error, 'interrupted by restart');
});
