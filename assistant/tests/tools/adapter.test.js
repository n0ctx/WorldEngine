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

test('wrapToolEvents: 写入类工具显式声明 success===false 时判定失败', async () => {
  // 写入类（apply_*/meta）通过 { success: false } 表达失败，必须被识别。
  for (const ret of [{ success: false, error: 'x' }, { success: 0 }, { success: 'no' }]) {
    const events = [];
    const tool = { type: 'function', function: { name: 'x' }, execute: async () => ret };
    const wrapped = wrapToolEvents(tool, (e) => events.push(e));
    await wrapped.execute({});
    const done = events.at(-1);
    assert.equal(done.success, false, `返回 ${JSON.stringify(ret)} 应判定失败`);
  }
});

test('wrapToolEvents: 读取类工具返回任意 payload 视为成功（避免 preview/read 被误染失败）', async () => {
  // 读取类（preview_card / read_file / list_resources）返回字符串 / JSON / 数据对象，没有 success 字段。
  // 没 throw 就应当判定成功，否则正常 preview 也会被显示为"失败"气泡。
  for (const ret of ['raw text', JSON.stringify([1, 2, 3]), { card: { name: 'X' } }, [1, 2], null, undefined]) {
    const events = [];
    const tool = { type: 'function', function: { name: 'x' }, execute: async () => ret };
    const wrapped = wrapToolEvents(tool, (e) => events.push(e));
    await wrapped.execute({});
    const done = events.at(-1);
    assert.equal(done.success, true, `返回 ${JSON.stringify(ret)} 应判定成功`);
  }
});

test('wrapToolEvents: afterCompleted 在成功 / 失败两条路径都被调用，含 success 与 error', async () => {
  const calls = [];
  const okTool = { type: 'function', function: { name: 'ok' }, execute: async () => ({ success: true }) };
  const failTool = { type: 'function', function: { name: 'bad' }, execute: async () => ({ success: false, error: 'boom' }) };
  const throwTool = { type: 'function', function: { name: 'throws' }, execute: async () => { throw new Error('explode'); } };

  await wrapToolEvents(okTool, () => {}, { afterCompleted: (info) => calls.push(info) }).execute({});
  await wrapToolEvents(failTool, () => {}, { afterCompleted: (info) => calls.push(info) }).execute({});
  await assert.rejects(
    () => wrapToolEvents(throwTool, () => {}, { afterCompleted: (info) => calls.push(info) }).execute({}),
    /explode/,
  );

  assert.deepEqual(calls[0], { success: true, error: undefined, name: 'ok' });
  assert.deepEqual(calls[1], { success: false, error: 'boom', name: 'bad' });
  assert.deepEqual(calls[2], { success: false, error: 'explode', name: 'throws' });
});

test('wrapToolEvents: afterCompleted 抛 ToolLoopControlSignal 可中断循环', async () => {
  const { ToolLoopControlSignal, TOOL_LOOP_SIGNAL } = await import('../../../backend/llm/tool-loop-control.js');
  const tool = { type: 'function', function: { name: 'x' }, execute: async () => ({ success: false, error: 'x' }) };
  const afterCompleted = () => {
    throw new ToolLoopControlSignal(TOOL_LOOP_SIGNAL.PAUSED, { message: '熔断' });
  };
  await assert.rejects(
    () => wrapToolEvents(tool, () => {}, { afterCompleted }).execute({}),
    (err) => err.name === 'ToolLoopControlSignal' && err.kind === TOOL_LOOP_SIGNAL.PAUSED,
  );
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
