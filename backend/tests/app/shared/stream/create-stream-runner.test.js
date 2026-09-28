import test from 'node:test';
import assert from 'node:assert/strict';

import { freshImport } from '../../../helpers/test-env.js';

function makeStream(chunks) {
  return (async function* () {
    for (const chunk of chunks) yield chunk;
  })();
}

test('runStreamLifecycle 在进入 beforeStream 前等待记忆提交（turn-record）完成', async () => {
  const { runStreamLifecycle } = await freshImport('backend/app/shared/stream/create-stream-runner.js');
  const { trackMemoryCommit } = await freshImport('backend/utils/memory-commit-tracker.js');

  const sessionId = 'lifecycle-waits-turn-record';
  let commitDone = false;
  trackMemoryCommit(sessionId, new Promise((resolve) => {
    setTimeout(() => { commitDone = true; resolve(); }, 10);
  }));

  let beforeStreamSawCommitDone = null;

  await runStreamLifecycle({
    sessionId,
    activeStreams: new Map(),
    emitSse: () => {},
    beforeStream: async () => {
      beforeStreamSawCommitDone = commitDone;
      return {};
    },
    createStream: async () => makeStream(['hi']),
    onDone: () => ({ ok: true }),
  });

  assert.equal(beforeStreamSawCommitDone, true);
});

test('runStreamLifecycle 不等待未登记 blocksNextTurn 的任务（如 turn-index）', async () => {
  const { runStreamLifecycle } = await freshImport('backend/app/shared/stream/create-stream-runner.js');

  const sessionId = 'lifecycle-no-pending-commit';
  // 没有任何 trackMemoryCommit 登记（模拟 turn-index 等不进等待点的任务），应立即进入 beforeStream。
  const startedAt = Date.now();
  let beforeStreamAt = null;

  await runStreamLifecycle({
    sessionId,
    activeStreams: new Map(),
    emitSse: () => {},
    beforeStream: async () => { beforeStreamAt = Date.now(); return {}; },
    createStream: async () => makeStream(['hi']),
    onDone: () => ({ ok: true }),
  });

  assert.ok(beforeStreamAt - startedAt < 50);
});

test('turn-record 失败时记忆提交等待点照样放行', async () => {
  const { runStreamLifecycle } = await freshImport('backend/app/shared/stream/create-stream-runner.js');
  const { trackMemoryCommit } = await freshImport('backend/utils/memory-commit-tracker.js');

  const sessionId = 'lifecycle-turn-record-failed';
  // post-gen-runner 内部用 rawPromise.catch(() => {}) 包一层，这里直接模拟该结果：一个 resolve 的 promise。
  trackMemoryCommit(sessionId, Promise.reject(new Error('turn-record boom')).catch(() => {}));

  let beforeStreamCalled = false;
  await runStreamLifecycle({
    sessionId,
    activeStreams: new Map(),
    emitSse: () => {},
    beforeStream: async () => { beforeStreamCalled = true; return {}; },
    createStream: async () => makeStream(['hi']),
    onDone: () => ({ ok: true }),
  });

  assert.equal(beforeStreamCalled, true);
});
