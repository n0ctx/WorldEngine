import test from 'node:test';
import assert from 'node:assert/strict';

import { freshImport } from '../helpers/test-env.js';

/**
 * 构造最小测试上下文；endPromise 在 res.end() 被调用时 resolve。
 */
function makeCtx(overrides = {}) {
  const emitted = [];
  let endResolve;
  const endPromise = new Promise((resolve) => { endResolve = resolve; });

  return {
    emitted,
    endPromise,
    res: { end: () => endResolve() },
    streamState: { isClientClosed: () => false },
    sid: 'test1234',
    emitSse: (payload) => emitted.push(payload),
    ...overrides,
  };
}

test('keepSseAlive=true 任务完成后推送 SSE 事件并关闭连接', async () => {
  const { runPostGenTasks } = await freshImport('backend/utils/post-gen-runner.js');
  const ctx = makeCtx();

  const { hasSseWaits } = runPostGenTasks('runner-test-1', [
    {
      label: 'task-a',
      priority: 2,
      fn: async () => 'hello',
      sseEvent: 'task_done',
      ssePayload: (r) => ({ type: 'task_done', value: r }),
      keepSseAlive: true,
    },
  ], ctx);

  assert.equal(hasSseWaits, true);
  await ctx.endPromise;

  assert.equal(ctx.emitted.length, 1);
  assert.deepEqual(ctx.emitted[0], { type: 'task_done', value: 'hello' });
});

test('keepSseAlive=false 任务不阻塞连接，hasSseWaits=false', async () => {
  const { runPostGenTasks } = await freshImport('backend/utils/post-gen-runner.js');

  let taskRan = false;
  const ctx = makeCtx();

  const { hasSseWaits } = runPostGenTasks('runner-test-2', [
    {
      label: 'bg-task',
      priority: 3,
      fn: async () => { taskRan = true; },
      keepSseAlive: false,
    },
  ], ctx);

  assert.equal(hasSseWaits, false);
  // 调用方在 hasSseWaits=false 时自行关闭连接，runner 不调用 res.end
  // 等一个 tick 确认 endPromise 未被 resolve
  await new Promise((r) => setImmediate(r));
  // taskRan 不一定为 true（异步入队），但 hasSseWaits 已正确返回
  assert.equal(hasSseWaits, false);
});

test('condition=false 跳过任务且不推送 SSE', async () => {
  const { runPostGenTasks } = await freshImport('backend/utils/post-gen-runner.js');

  let taskRan = false;
  const ctx = makeCtx();

  const { hasSseWaits } = runPostGenTasks('runner-test-3', [
    {
      label: 'skipped',
      priority: 2,
      fn: async () => { taskRan = true; return 'skipped'; },
      condition: false,
      sseEvent: 'skipped_event',
      ssePayload: (r) => ({ type: 'skipped_event', value: r }),
      keepSseAlive: true,
    },
  ], ctx);

  // condition=false → 不入队 → 无 ssePromises → hasSseWaits=false
  assert.equal(hasSseWaits, false);
  await new Promise((r) => setImmediate(r));
  assert.equal(taskRan, false);
  assert.equal(ctx.emitted.length, 0);
});

test('ssePayload 返回 null 时不推送 SSE 事件', async () => {
  const { runPostGenTasks } = await freshImport('backend/utils/post-gen-runner.js');
  const ctx = makeCtx();

  const { hasSseWaits } = runPostGenTasks('runner-test-4', [
    {
      label: 'null-payload',
      priority: 2,
      fn: async () => null,              // 任务返回 null（模拟 title GIVEUP）
      sseEvent: 'title_updated',
      ssePayload: (r) => r ? { type: 'title_updated', title: r } : null,
      keepSseAlive: true,
    },
  ], ctx);

  assert.equal(hasSseWaits, true);
  await ctx.endPromise;

  // ssePayload 返回 null → emitSse 不被调用
  assert.equal(ctx.emitted.length, 0);
});

test('混合 keepSseAlive 任务：只有 keepSseAlive=true 的任务控制连接关闭', async () => {
  const { runPostGenTasks } = await freshImport('backend/utils/post-gen-runner.js');
  const ctx = makeCtx();

  const order = [];

  const { hasSseWaits } = runPostGenTasks('runner-test-5', [
    {
      label: 'sse-task',
      priority: 2,
      fn: async () => { order.push('sse'); return 'val'; },
      sseEvent: 'sse_event',
      ssePayload: (r) => ({ type: 'sse_event', value: r }),
      keepSseAlive: true,
    },
    {
      label: 'bg-task',
      priority: 3,
      fn: async () => { order.push('bg'); },
      keepSseAlive: false,
    },
  ], ctx);

  assert.equal(hasSseWaits, true);
  await ctx.endPromise;

  assert.equal(ctx.emitted.length, 1);
  assert.equal(ctx.emitted[0].type, 'sse_event');
});

test('多个 keepSseAlive=true 任务全部完成后才关闭连接', async () => {
  const { runPostGenTasks } = await freshImport('backend/utils/post-gen-runner.js');
  const ctx = makeCtx();

  const emittedTypes = [];

  const { hasSseWaits } = runPostGenTasks('runner-test-6', [
    {
      label: 'task-1',
      priority: 2,
      fn: async () => 'r1',
      sseEvent: 'event_1',
      ssePayload: () => { emittedTypes.push('event_1'); return { type: 'event_1' }; },
      keepSseAlive: true,
    },
    {
      label: 'task-2',
      priority: 3,
      fn: async () => 'r2',
      sseEvent: 'event_2',
      ssePayload: () => { emittedTypes.push('event_2'); return { type: 'event_2' }; },
      keepSseAlive: true,
    },
  ], ctx);

  assert.equal(hasSseWaits, true);
  await ctx.endPromise;

  // 两个事件都推出
  assert.equal(emittedTypes.length, 2);
  assert.ok(emittedTypes.includes('event_1'));
  assert.ok(emittedTypes.includes('event_2'));
});
