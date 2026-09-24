import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapToolEvents } from '../../server/tools/adapter.js';

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

test('wrapToolEvents: 返回 { success:false } 时判定失败并带出 error', async () => {
  const events = [];
  const tool = { type: 'function', function: { name: 'x' }, execute: async () => ({ success: false, error: '字段不存在' }) };
  await wrapToolEvents(tool, (e) => events.push(e)).execute({});
  assert.equal(events.at(-1).success, false);
  assert.equal(events.at(-1).error, '字段不存在');
});

test('wrapToolEvents: describe 的操作对象随 started 事件发出，包装后只保留模型可见字段', async () => {
  const events = [];
  const tool = {
    type: 'function',
    function: { name: 'update' },
    describe: ({ ref }) => ({ summary: ref, target: 'entry' }),
    execute: async () => '已更新',
  };
  const wrapped = wrapToolEvents(tool, (e) => events.push(e));
  assert.deepEqual(Object.keys(wrapped).sort(), ['execute', 'function', 'type']);
  await wrapped.execute({ ref: 'entry:e1' });
  assert.equal(events[0].summary, 'entry:e1');
  assert.equal(events[0].target, 'entry');
});

test('wrapToolEvents: 没有 success:false 的返回值都视为成功', async () => {
  for (const ret of ['raw text', JSON.stringify([1, 2, 3]), { card: { name: 'X' } }, [1, 2], null, undefined]) {
    const events = [];
    const tool = { type: 'function', function: { name: 'x' }, execute: async () => ret };
    const wrapped = wrapToolEvents(tool, (e) => events.push(e));
    await wrapped.execute({});
    const done = events.at(-1);
    assert.equal(done.success, true, `返回 ${JSON.stringify(ret)} 应判定成功`);
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

test('wrapToolEvents: recordResult 的工具成功时带出回执，失败或未声明时不带', async () => {
  const run = async (tool) => {
    const events = [];
    await wrapToolEvents({ type: 'function', function: { name: 'x' }, ...tool }, (e) => events.push(e)).execute({});
    return events.at(-1);
  };
  assert.equal((await run({ recordResult: true, execute: async () => '已创建 entry:e1' })).result, '已创建 entry:e1');
  assert.equal((await run({ recordResult: true, execute: async () => ({ success: false, error: 'x' }) })).result, undefined);
  assert.equal((await run({ execute: async () => '大段读取结果' })).result, undefined);
});
