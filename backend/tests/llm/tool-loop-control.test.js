import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runToolLoop,
  ToolLoopCancelledError,
  isToolLoopCancelledError,
} from '../../llm/tool-loop-control.js';

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
    mode: 'complete',
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
    mode: 'complete',
  });
  assert.equal(out, 'done');
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
      mode: 'complete',
    }),
    (err) => err.name === 'ToolLoopCancelledError' && /mock cancel/.test(err.message),
  );
});

test('runToolLoop: 工具普通 error 被字符串化喂回模型', async () => {
  let fedBack;
  const provider = {
    initState: (messages) => ({ messages: [...messages] }),
    oneTurn: async (state, defs, mode, iter) => {
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
    mode: 'complete',
  });
  assert.equal(out, 'ok');
  assert.match(fedBack.content, /kaboom/);
});

test('runToolLoop: kind=fallback 走 completeNoTools', async () => {
  const provider = fakeProvider([{ kind: 'fallback' }]);
  const out = await runToolLoop({
    provider,
    messages: [{ role: 'user', content: 'x' }],
    toolDefs: [],
    toolHandlers: {},
    config: {},
    mode: 'complete',
  });
  assert.equal(out, 'fallback-no-tools');
});

test('runToolLoop: 超 maxIterations 兜底 completeNoTools', async () => {
  // 所有轮都返回 tools,永不终止
  const turns = Array.from({ length: 10 }, (_, k) => ({
    kind: 'tools',
    toolCalls: [{ id: `t${k}`, name: 'foo', arguments: {} }],
    assistantBlock: { role: 'assistant', tool_calls: [{ id: `t${k}` }] },
  }));
  const provider = fakeProvider(turns);
  const out = await runToolLoop({
    provider,
    messages: [{ role: 'user', content: 'x' }],
    toolDefs: [],
    toolHandlers: { foo: async () => 'r' },
    config: {},
    mode: 'complete',
    maxIterations: 3,
  });
  assert.equal(out, 'fallback-no-tools');
});

test('runToolLoop: mode=resolve 终态返回 enriched messages', async () => {
  const provider = fakeProvider([
    {
      kind: 'tools',
      toolCalls: [{ id: 't1', name: 'foo', arguments: {} }],
      assistantBlock: { role: 'assistant', tool_calls: [{ id: 't1' }] },
    },
    { kind: 'text', text: 'final' },
  ]);
  const out = await runToolLoop({
    provider,
    messages: [{ role: 'user', content: 'x' }],
    toolDefs: [],
    toolHandlers: { foo: async () => 'r' },
    config: {},
    mode: 'resolve',
  });
  assert.ok(Array.isArray(out));
  // 至少包含 user + assistant + tool 三条
  assert.ok(out.length >= 3);
  assert.equal(out[out.length - 1].role, 'tool');
});

test('runToolLoop: mode=resolve 且首轮 text → 返回原 messages 引用(未 enriched)', async () => {
  const provider = fakeProvider([{ kind: 'text', text: 'no-tools' }]);
  const original = [{ role: 'user', content: 'x' }];
  const out = await runToolLoop({
    provider,
    messages: original,
    toolDefs: [],
    toolHandlers: {},
    config: {},
    mode: 'resolve',
  });
  assert.strictEqual(out, original);
});

test('isToolLoopCancelledError 识别错误', () => {
  assert.equal(isToolLoopCancelledError(new ToolLoopCancelledError('x')), true);
  assert.equal(isToolLoopCancelledError(new Error('x')), false);
  assert.equal(isToolLoopCancelledError({ name: 'ToolLoopCancelledError' }), true);
});
