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
  const tool = { type: 'function', function: { name: 'x' }, execute: async () => ({ success: true }) };
  const wrapped = wrapToolEvents(tool, (e) => events.push(e));
  await wrapped.execute({});
  assert.equal(events[0].type, 'tool_call_started');
  assert.equal(events[1].type, 'tool_call_completed');
  assert.equal(events[1].success, true);
});

test('wrapToolEvents: cancelCheck 返回 true 时前置抛 ToolLoopCancelledError', async () => {
  const { ToolLoopCancelledError } = await import('../../../backend/llm/tool-loop-control.js');
  const tool = { type: 'function', function: { name: 'x' }, execute: async () => ({ success: true }) };
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

test('wrapToolEvents: 严格判定 — 返回非 {success:true} 一律视为失败', async () => {
  // 旧逻辑只要不是 {ok:false} 都算成功；新逻辑必须显式 success===true。
  // 覆盖几种工具异常路径：返回字符串、返回 undefined、返回缺 success 的对象。
  for (const ret of ['ok', undefined, { result: 'done' }, { ok: true }, null]) {
    const events = [];
    const tool = { type: 'function', function: { name: 'x' }, execute: async () => ret };
    const wrapped = wrapToolEvents(tool, (e) => events.push(e));
    await wrapped.execute({});
    const done = events.at(-1);
    assert.equal(done.success, false, `返回 ${JSON.stringify(ret)} 应判定失败`);
  }
});

test('wrapToolEvents: 默认 callId 来自 crypto.randomUUID(8 位 hex)', async () => {
  const events = [];
  const tool = { type: 'function', function: { name: 'x' }, execute: async () => ({ success: true }) };
  const wrapped = wrapToolEvents(tool, (e) => events.push(e));
  await wrapped.execute({});
  const started = events.find((e) => e.type === 'tool_call_started');
  assert.ok(started.callId, '应有 callId');
  // crypto.randomUUID 形如 "12345678-..." → slice(0,8) 为 8 位 16 进制
  assert.match(started.callId, /^[0-9a-f]{8}$/, `callId 应为 8 位 hex,实际:${started.callId}`);
});
