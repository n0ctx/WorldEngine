import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runToolLoop,
  ToolLoopCancelledError,
  ToolLoopControlSignal,
  isToolLoopCancelledError,
  isToolLoopControlSignal,
} from '../../llm/tool-loop-control.js';
import { recordingProvider, toolsTurn, noteOf, userMsg } from '../helpers/tool-loop-fakes.js';

// fake provider 工厂:turns 为每次 oneTurn 返回的结果数组
function fakeProvider(turns) {
  let i = 0;
  return {
    initState: (messages) => ({ messages: [...messages] }),
    oneTurn: async () => turns[i++] ?? { kind: 'text', text: 'fallback-text' },
    appendToolTurn: (state, turn, results) => ({
      ...state,
      messages: [
        ...state.messages,
        turn.assistantBlock ?? { role: 'assistant', tool_calls: turn.toolCalls },
        ...results.map((r, k) => ({
          role: 'tool',
          tool_call_id: turn.toolCalls[k].id,
          content: r,
        })),
      ],
    }),
    completeNoTools: async () => 'fallback-no-tools',
    stateToMessages: (state) => state.messages,
  };
}

test('runToolLoop: 首轮就返回 text → 直接结束', async () => {
  const provider = fakeProvider([{ kind: 'text', text: 'hello' }]);
  const out = await runToolLoop({
    provider,
    messages: [{ role: 'user', content: 'hi' }],
    toolDefs: [],
    toolHandlers: {},
    config: {},
  });
  assert.equal(out, 'hello');
});

test('runToolLoop: 工具调用 → 二轮文本', async () => {
  const provider = fakeProvider([
    {
      kind: 'tools',
      toolCalls: [{ id: 't1', name: 'foo', arguments: {} }],
      assistantBlock: { role: 'assistant', content: null, tool_calls: [{ id: 't1' }] },
    },
    { kind: 'text', text: 'done' },
  ]);
  const out = await runToolLoop({
    provider,
    messages: [{ role: 'user', content: 'go' }],
    toolDefs: [],
    toolHandlers: { foo: async () => 'foo-result' },
    config: {},
  });
  assert.equal(out, 'done');
});

test('runToolLoop: completeResultMode=detail 返回文本与富化消息', async () => {
  const provider = fakeProvider([
    {
      kind: 'tools',
      toolCalls: [{ id: 't1', name: 'foo', arguments: {} }],
      assistantBlock: { role: 'assistant', content: null, tool_calls: [{ id: 't1' }] },
    },
    { kind: 'text', text: 'done' },
  ]);
  const out = await runToolLoop({
    provider,
    messages: [{ role: 'user', content: 'go' }],
    toolDefs: [],
    toolHandlers: { foo: async () => 'foo-result' },
    config: {},
    completeResultMode: 'detail',
  });
  assert.equal(out.text, 'done');
  assert.ok(Array.isArray(out.messages));
  assert.equal(out.messages.at(-1).role, 'tool');
});

test('runToolLoop: cancel 信号透传(handler 抛 ToolLoopCancelledError)', async () => {
  const provider = fakeProvider([
    {
      kind: 'tools',
      toolCalls: [{ id: 't1', name: 'cancelTool', arguments: {} }],
      assistantBlock: { role: 'assistant', tool_calls: [{ id: 't1' }] },
    },
  ]);
  await assert.rejects(
    () => runToolLoop({
      provider,
      messages: [{ role: 'user', content: 'x' }],
      toolDefs: [],
      toolHandlers: { cancelTool: async () => { throw new ToolLoopCancelledError('mock cancel'); } },
      config: {},
      }),
    (err) => err.name === 'ToolLoopCancelledError' && /mock cancel/.test(err.message),
  );
});

test('runToolLoop: control signal 透传(handler 抛 ToolLoopControlSignal)', async () => {
  const provider = fakeProvider([
    {
      kind: 'tools',
      toolCalls: [{ id: 't1', name: 'pauseTool', arguments: {} }],
      assistantBlock: { role: 'assistant', tool_calls: [{ id: 't1' }] },
    },
  ]);
  await assert.rejects(
    () => runToolLoop({
      provider,
      messages: [{ role: 'user', content: 'x' }],
      toolDefs: [],
      toolHandlers: { pauseTool: async () => { throw new ToolLoopControlSignal('paused', { taskId: 't' }); } },
      config: {},
      }),
    (err) => isToolLoopControlSignal(err) && err.kind === 'paused',
  );
});

test('runToolLoop: 工具普通 error 被字符串化喂回模型', async () => {
  let fedBack;
  const provider = {
    initState: (messages) => ({ messages: [...messages] }),
    oneTurn: async (state, defs, iter) => {
      if (iter === 0) {
        return {
          kind: 'tools',
          toolCalls: [{ id: 't1', name: 'boom', arguments: {} }],
          assistantBlock: { role: 'assistant', tool_calls: [{ id: 't1' }] },
        };
      }
      fedBack = state.messages[state.messages.length - 1];
      return { kind: 'text', text: 'ok' };
    },
    appendToolTurn: (state, turn, results) => ({
      ...state,
      messages: [
        ...state.messages,
        turn.assistantBlock,
        ...results.map((r, k) => ({ role: 'tool', tool_call_id: turn.toolCalls[k].id, content: r })),
      ],
    }),
    completeNoTools: async () => 'unused',
    stateToMessages: (s) => s.messages,
  };
  const out = await runToolLoop({
    provider,
    messages: [{ role: 'user', content: 'x' }],
    toolDefs: [],
    toolHandlers: { boom: async () => { throw new Error('kaboom'); } },
    config: {},
  });
  assert.equal(out, 'ok');
  assert.match(fedBack.content, /kaboom/);
});

test('runToolLoop: 首轮 kind=fallback → 无工具补全收到「没有执行任何操作」的说明', async () => {
  const rec = recordingProvider(() => ({ kind: 'fallback' }));
  const loopRef = {};
  const out = await runToolLoop({
    provider: rec.provider,
    messages: userMsg,
    toolDefs: [],
    toolHandlers: {},
    config: { loopRef },
  });
  assert.equal(out, 'no-tools-text');
  assert.equal(rec.noToolsMessages.length, 1);
  assert.match(noteOf(rec.noToolsMessages[0]), /^x\n\n\[系统说明\]/);
  assert.match(noteOf(rec.noToolsMessages[0]), /拒绝了工具调用请求，没有执行任何操作，请告知用户换用支持工具调用的模型/);
  assert.deepEqual(loopRef, { stopReason: 'fallback', toolCallCount: 0 });
});

test('runToolLoop: 超 maxIterations → 说明含上限与操作清单，loopRef 回传 max_iterations', async () => {
  // 所有轮都返回 tools,永不终止;每轮参数不同,不触发重复失败保护
  const rec = recordingProvider((iter) => toolsTurn([{ id: `t${iter}`, name: 'foo', arguments: { n: iter } }]));
  const loopRef = {};
  const out = await runToolLoop({
    provider: rec.provider,
    messages: userMsg,
    toolDefs: [],
    toolHandlers: { foo: async ({ n }) => (n === 1 ? { success: false, error: 'bad n' } : 'r') },
    config: { maxIterations: 3, loopRef },
  });
  assert.equal(out, 'no-tools-text');
  assert.equal(rec.turnCalls, 3);
  const note = noteOf(rec.noToolsMessages[0]);
  assert.match(note, /轮数已达上限（3 轮）/);
  assert.match(note, /共 3 次/);
  assert.match(note, /1\. \[成功\] foo \{"n":0\} → r/);
  assert.match(note, /2\. \[失败\] foo \{"n":1\} → .*bad n/);
  assert.match(note, /哪些部分已经完成、哪些部分没有完成/);
  assert.deepEqual(loopRef, { stopReason: 'max_iterations', toolCallCount: 3 });
});

test('isToolLoopCancelledError 识别错误', () => {
  assert.equal(isToolLoopCancelledError(new ToolLoopCancelledError('x')), true);
  assert.equal(isToolLoopCancelledError(new Error('x')), false);
  assert.equal(isToolLoopCancelledError({ name: 'ToolLoopCancelledError' }), true);
});

test('isToolLoopControlSignal 识别错误', () => {
  assert.equal(isToolLoopControlSignal(new ToolLoopControlSignal('terminal')), true);
  assert.equal(isToolLoopControlSignal(new Error('x')), false);
  assert.equal(isToolLoopControlSignal({ name: 'ToolLoopControlSignal' }), true);
});

test('runToolLoop: beforeTurn 每次模型请求前收到当前消息，返回 null 时状态不变', async () => {
  const rec = recordingProvider((iter) => (iter === 0 ? toolsTurn([{ name: 'foo' }]) : { kind: 'text', text: 'done' }));
  const seen = [];
  const out = await runToolLoop({
    provider: rec.provider,
    messages: [{ role: 'user', content: 'go' }],
    toolDefs: [],
    toolHandlers: { foo: async () => 'r1' },
    config: { beforeTurn: async (messages, iter) => { seen.push([iter, messages.map((m) => m.role)]); return null; } },
  });
  assert.equal(out, 'done');
  assert.deepEqual(seen, [[0, ['user']], [1, ['user', 'assistant', 'tool']]]);
  assert.deepEqual(rec.turnStates[1].map((m) => m.role), ['user', 'assistant', 'tool']);
});

test('runToolLoop: beforeTurn 返回新消息数组后，下一次请求和触顶兜底都以它为准', async () => {
  const rec = recordingProvider(() => toolsTurn([{ name: 'foo' }]));
  const compacted = [{ role: 'user', content: '压缩后的请求' }];
  await runToolLoop({
    provider: rec.provider,
    messages: [{ role: 'user', content: '原始请求' }],
    toolDefs: [],
    toolHandlers: { foo: async () => 'r1' },
    config: { maxIterations: 2, beforeTurn: async (_messages, iter) => (iter === 1 ? compacted : null) },
  });
  assert.deepEqual(rec.turnStates[1], compacted);
  const noteMessages = rec.noToolsMessages[0];
  assert.equal(noteMessages.length, 1);
  assert.match(noteOf(noteMessages), /^压缩后的请求/);
});
