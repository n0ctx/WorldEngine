import test from 'node:test';
import assert from 'node:assert/strict';

import { awaitMemoryCommit, trackMemoryCommit } from '../../utils/memory-commit-tracker.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('同一轮登记两个记忆提交时，下一轮要等两个都完成', async () => {
  const first = deferred();
  const second = deferred();
  trackMemoryCommit('s1', first.promise);
  trackMemoryCommit('s1', second.promise);

  let settled = false;
  const waiting = awaitMemoryCommit('s1').then(() => { settled = true; });
  second.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false, '先登记的提交还没完成，不能放行');

  first.resolve();
  await waiting;
  assert.equal(settled, true);
});

test('没有挂起提交时立即返回', async () => {
  let settled = false;
  const waiting = awaitMemoryCommit('none').then(() => { settled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, true);
  await waiting;
});
