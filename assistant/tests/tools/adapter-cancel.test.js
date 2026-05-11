// assistant/tests/tools/adapter-cancel.test.js
//
// 回归保护:wrapToolEvents 的 cancel 闸门三时机
//   A: tool 执行前已 cancelled → 直接抛 ToolLoopCancelledError,不发 started
//   B: tool 执行中变 cancelled → 发 tool_call_completed(success:false) 并抛 ToolLoopCancelledError
//   C: 未 cancel → 正常 tool_call_completed(success:true)

import test from 'node:test';
import assert from 'node:assert/strict';

import { wrapToolEvents } from '../../server/tools/adapter.js';
import { ToolLoopCancelledError } from '../../../backend/llm/tool-loop-control.js';

test('cancel 时机 A: tool 执行前已 cancelled → 直接抛 ToolLoopCancelledError,无 started 事件', async () => {
  const events = [];
  const tool = { type: 'function', function: { name: 'x' }, execute: async () => ({ ok: true }) };
  const wrapped = wrapToolEvents(tool, (e) => events.push(e), { cancelCheck: () => true });
  await assert.rejects(() => wrapped.execute({}), ToolLoopCancelledError);
  assert.equal(
    events.find((e) => e.type === 'tool_call_started'),
    undefined,
    '前置闸门命中时不应发 started',
  );
  assert.equal(
    events.find((e) => e.type === 'tool_call_completed'),
    undefined,
    '前置闸门命中时也不应发 completed',
  );
});

test('cancel 时机 B: tool 执行中变 cancelled → 发 completed(success:false)并抛 ToolLoopCancelledError', async () => {
  const events = [];
  let cancelled = false;
  let onCancelLogCalled = null;
  const tool = {
    type: 'function',
    function: { name: 'x' },
    execute: async () => {
      // 模拟工具执行期间外部触发了 cancel
      cancelled = true;
      return { ok: true };
    },
  };
  const wrapped = wrapToolEvents(tool, (e) => events.push(e), {
    cancelCheck: () => cancelled,
    onCancelLog: (name) => { onCancelLogCalled = name; },
  });
  await assert.rejects(() => wrapped.execute({}), ToolLoopCancelledError);
  const started = events.find((e) => e.type === 'tool_call_started');
  const done = events.find((e) => e.type === 'tool_call_completed');
  assert.ok(started, '应发 started');
  assert.ok(done, '应发 completed');
  assert.equal(done.success, false, '后置闸门命中时 success:false');
  assert.equal(done.callId, started.callId, 'completed.callId 应与 started 一致');
  assert.equal(onCancelLogCalled, 'x', 'onCancelLog 应被调用且带 toolName');
});

test('cancel 时机 C: 未 cancel → 正常 success:true', async () => {
  const events = [];
  const tool = { type: 'function', function: { name: 'x' }, execute: async () => ({ ok: true }) };
  const wrapped = wrapToolEvents(tool, (e) => events.push(e), { cancelCheck: () => false });
  const r = await wrapped.execute({});
  assert.deepEqual(r, { ok: true });
  const started = events.find((e) => e.type === 'tool_call_started');
  const done = events.find((e) => e.type === 'tool_call_completed');
  assert.ok(started, '应发 started');
  assert.ok(done, '应发 completed');
  assert.equal(done.success, true);
  assert.equal(done.callId, started.callId, 'completed.callId 应与 started 一致');
});
