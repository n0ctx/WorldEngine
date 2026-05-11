import test from 'node:test';
import assert from 'node:assert/strict';
import { toLLMTool, wrapToolEvents } from '../../server/tools/adapter.js';

test('toLLMTool: 三种形态归一', () => {
  const exec = async () => 'ok';
  const a = toLLMTool({ definition: { name: 'foo' }, execute: exec });
  assert.equal(a.function.name, 'foo');
  const b = toLLMTool({ definition: { type: 'function', function: { name: 'bar' } }, execute: exec });
  assert.equal(b.function.name, 'bar');
  const t = { type: 'function', function: { name: 'baz' }, execute: exec };
  assert.equal(toLLMTool(t), t);
  assert.throws(() => toLLMTool({ definition: { name: 'no-exec' } }), /missing execute/);
  assert.throws(() => toLLMTool({ definition: {} }, exec), /unrecognized/);
});

test('wrapToolEvents: 不带 cancelCheck 时正常发事件', async () => {
  const events = [];
  const tool = { type: 'function', function: { name: 'x' }, execute: async () => ({ ok: true }) };
  const wrapped = wrapToolEvents(tool, (e) => events.push(e));
  await wrapped.execute({});
  assert.equal(events[0].type, 'tool_call_started');
  assert.equal(events[1].type, 'tool_call_completed');
  assert.equal(events[1].success, true);
});

test('wrapToolEvents: cancelCheck 返回 true 时前置抛 ToolLoopCancelledError', async () => {
  const { ToolLoopCancelledError } = await import('../../../backend/llm/tool-loop-control.js');
  const tool = { type: 'function', function: { name: 'x' }, execute: async () => ({ ok: true }) };
  const wrapped = wrapToolEvents(tool, () => {}, { cancelCheck: () => true });
  await assert.rejects(() => wrapped.execute({}), ToolLoopCancelledError);
});

test('wrapToolEvents: execute 抛错时发 success:false 并透传', async () => {
  const events = [];
  const tool = { type: 'function', function: { name: 'x' }, execute: async () => { throw new Error('boom'); } };
  const wrapped = wrapToolEvents(tool, (e) => events.push(e));
  await assert.rejects(() => wrapped.execute({}), /boom/);
  assert.equal(events.at(-1).success, false);
});

test('wrapToolEvents: 默认 callId 来自 crypto.randomUUID(8 位 hex)', async () => {
  const events = [];
  const tool = { type: 'function', function: { name: 'x' }, execute: async () => ({ ok: true }) };
  const wrapped = wrapToolEvents(tool, (e) => events.push(e));
  await wrapped.execute({});
  const started = events.find((e) => e.type === 'tool_call_started');
  assert.ok(started.callId, '应有 callId');
  // crypto.randomUUID 形如 "12345678-..." → slice(0,8) 为 8 位 16 进制
  assert.match(started.callId, /^[0-9a-f]{8}$/, `callId 应为 8 位 hex,实际:${started.callId}`);
});
