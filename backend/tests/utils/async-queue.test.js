import test from 'node:test';
import assert from 'node:assert/strict';

import { freshImport } from '../helpers/test-env.js';

test('enqueue 在同一 session 内按优先级串行执行未开始任务', async () => {
  const { enqueue } = await freshImport('backend/utils/async-queue.js');
  const order = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const first = enqueue('session-a', async () => {
    order.push('first-start');
    await firstGate;
    order.push('first-end');
  }, 5, 'first');

  const second = enqueue('session-a', async () => {
    order.push('second');
  }, 4, 'second');

  const third = enqueue('session-a', async () => {
    order.push('third');
  }, 2, 'third');

  releaseFirst();
  await Promise.all([first, second, third]);

  assert.deepEqual(order, ['first-start', 'first-end', 'third', 'second']);
});

test('clearPending 只清理未开始且优先级不高于阈值的任务', async () => {
  const { enqueue, clearPending } = await freshImport('backend/utils/async-queue.js');
  const order = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const running = enqueue('session-b', async () => {
    order.push('running');
    await firstGate;
  }, 2, 'running');

  const kept = enqueue('session-b', async () => {
    order.push('kept');
  }, 1, 'kept');

  const cleared = enqueue('session-b', async () => {
    order.push('cleared');
  }, 4, 'cleared');

  clearPending('session-b', 3);
  releaseFirst();

  await running;
  await kept;
  await assert.rejects(cleared, /Task cleared/);
  assert.deepEqual(order, ['running', 'kept']);
});

test('不同 session 的队列互不阻塞', async () => {
  const { enqueue } = await freshImport('backend/utils/async-queue.js');
  let releaseA;
  const gateA = new Promise((resolve) => {
    releaseA = resolve;
  });
  const order = [];

  const taskA = enqueue('session-c', async () => {
    order.push('a-start');
    await gateA;
    order.push('a-end');
  }, 2, 'a');

  const taskB = enqueue('session-d', async () => {
    order.push('b');
  }, 2, 'b');

  await taskB;
  releaseA();
  await taskA;

  assert.deepEqual(order, ['a-start', 'b', 'a-end']);
});

test('waitForQueueIdle 会等待同 session 已入队任务全部结束', async () => {
  const { enqueue, waitForQueueIdle } = await freshImport('backend/utils/async-queue.js');
  const order = [];
  let releaseFirst;
  const gate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const first = enqueue('session-e', async () => {
    order.push('first-start');
    await gate;
    order.push('first-end');
  }, 2, 'first');
  const second = enqueue('session-e', async () => {
    order.push('second');
  }, 3, 'second');

  const idle = waitForQueueIdle('session-e').then(() => {
    order.push('idle');
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(order, ['first-start']);

  releaseFirst();
  await Promise.all([first, second, idle]);
  assert.deepEqual(order, ['first-start', 'first-end', 'second', 'idle']);
});
