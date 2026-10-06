import test from 'node:test';
import assert from 'node:assert/strict';

import { runToolLoop, isToolLoopCancelledError } from '../../llm/tool-loop-control.js';
import { recordingProvider, toolsTurn, httpError, waitForAbort, toolResultsOf, userMsg } from '../helpers/tool-loop-fakes.js';

// runToolLoop：重试、超时、取消都落在单次模型请求上

test('runToolLoop: 正常结束时 loopRef 回传 completed', async () => {
  const rec = recordingProvider((iter) => (iter === 0 ? toolsTurn([{ name: 'foo' }]) : { kind: 'text', text: 'done' }));
  const loopRef = {};
  await runToolLoop({ provider: rec.provider, messages: userMsg, toolDefs: [], toolHandlers: { foo: async () => 'r' }, config: { loopRef } });
  assert.deepEqual(loopRef, { stopReason: 'completed', toolCallCount: 1 });
  assert.equal(rec.noToolsMessages.length, 0);
});

test('runToolLoop: 中途报 500 只重试那一次请求，已执行的工具不重跑', async () => {
  let handlerCalls = 0;
  const rec = recordingProvider((iter, attempt) => {
    if (iter === 0) return toolsTurn([{ name: 'write' }]);
    if (attempt === 0) throw httpError(500);
    return { kind: 'text', text: 'done' };
  });
  const out = await runToolLoop({
    provider: rec.provider,
    messages: userMsg,
    toolDefs: [],
    toolHandlers: { write: async () => { handlerCalls += 1; return 'written'; } },
    config: { retry: { max: 2, delayMs: 0 } },
  });
  assert.equal(out, 'done');
  assert.equal(handlerCalls, 1);
  assert.equal(rec.turnCalls, 3);
  // 重试的那次请求带着同一份工具历史
  assert.deepEqual(toolResultsOf(rec.turnStates[2]), ['written']);
});

test('runToolLoop: 重试用尽后抛出最后一次错误', async () => {
  const rec = recordingProvider(() => { throw httpError(503, 'still down'); });
  await assert.rejects(
    () => runToolLoop({ provider: rec.provider, messages: userMsg, toolDefs: [], toolHandlers: {}, config: { retry: { max: 2, delayMs: 0 } } }),
    (err) => err.status === 503 && /still down/.test(err.message),
  );
  assert.equal(rec.turnCalls, 3);
});

test('runToolLoop: 401 立即抛出，不重试', async () => {
  const rec = recordingProvider(() => { throw httpError(401, 'bad key'); });
  await assert.rejects(
    () => runToolLoop({ provider: rec.provider, messages: userMsg, toolDefs: [], toolHandlers: {}, config: { retry: { max: 3, delayMs: 0 } } }),
    (err) => err.status === 401,
  );
  assert.equal(rec.turnCalls, 1);
});

test('runToolLoop: 单次请求超时得到 LLM_TIMEOUT，不重试；下一次请求是新的超时窗口', async () => {
  const rec = recordingProvider((_iter, _attempt, config) => waitForAbort(config.signal));
  await assert.rejects(
    () => runToolLoop({
      provider: rec.provider,
      messages: userMsg,
      toolDefs: [],
      toolHandlers: {},
      config: { timeoutMs: 20, retry: { max: 2, delayMs: 0 }, callType: 'assistant' },
    }),
    (err) => err.code === 'LLM_TIMEOUT' && err.status === 504 && /assistant timed out after 20ms/.test(err.message),
  );
  assert.equal(rec.turnCalls, 1);

  // 每次请求各有一个窗口：第 1 次请求之后的工具执行与第 2 次请求都不受第 1 次窗口影响
  const signals = [];
  const ok = recordingProvider((iter, _attempt, config) => {
    signals.push(config.signal);
    return iter === 0 ? toolsTurn([{ name: 'foo' }]) : { kind: 'text', text: 'done' };
  });
  const out = await runToolLoop({ provider: ok.provider, messages: userMsg, toolDefs: [], toolHandlers: { foo: async () => 'r' }, config: { timeoutMs: 5000 } });
  assert.equal(out, 'done');
  assert.notEqual(signals[0], signals[1]);
  assert.equal(signals[1].aborted, false);
});

test('runToolLoop: 调用方信号在请求中途中止 → ToolLoopCancelledError，不重试', async () => {
  const controller = new AbortController();
  const rec = recordingProvider((_iter, _attempt, config) => {
    const pending = waitForAbort(config.signal);
    controller.abort();
    return pending;
  });
  await assert.rejects(
    () => runToolLoop({
      provider: rec.provider,
      messages: userMsg,
      toolDefs: [],
      toolHandlers: {},
      config: { signal: controller.signal, timeoutMs: 5000, retry: { max: 3, delayMs: 0 } },
    }),
    (err) => isToolLoopCancelledError(err),
  );
  assert.equal(rec.turnCalls, 1);
});

test('runToolLoop: 调用方信号已中止时不发请求；工具执行期间中止则剩余调用不执行', async () => {
  const aborted = new AbortController();
  aborted.abort();
  const idle = recordingProvider(() => ({ kind: 'text', text: 'never' }));
  await assert.rejects(
    () => runToolLoop({ provider: idle.provider, messages: userMsg, toolDefs: [], toolHandlers: {}, config: { signal: aborted.signal } }),
    (err) => isToolLoopCancelledError(err),
  );
  assert.equal(idle.turnCalls, 0);

  const controller = new AbortController();
  const ran = [];
  const rec = recordingProvider(() => toolsTurn([{ name: 'first' }, { name: 'second' }]));
  await assert.rejects(
    () => runToolLoop({
      provider: rec.provider,
      messages: userMsg,
      toolDefs: [],
      toolHandlers: {
        first: async () => { ran.push('first'); controller.abort(); return 'r'; },
        second: async () => { ran.push('second'); return 'r'; },
      },
      config: { signal: controller.signal },
    }),
    (err) => isToolLoopCancelledError(err),
  );
  assert.deepEqual(ran, ['first']);
});

test('runToolLoop: 兜底的无工具补全同样按单次请求重试', async () => {
  let noToolsCalls = 0;
  const rec = recordingProvider(() => ({ kind: 'fallback' }), {
    noTools: async () => {
      noToolsCalls += 1;
      if (noToolsCalls === 1) throw httpError(502);
      return 'recovered';
    },
  });
  const out = await runToolLoop({ provider: rec.provider, messages: userMsg, toolDefs: [], toolHandlers: {}, config: { retry: { max: 1, delayMs: 0 } } });
  assert.equal(out, 'recovered');
  assert.equal(noToolsCalls, 2);
});
