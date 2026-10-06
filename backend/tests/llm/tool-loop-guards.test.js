import test from 'node:test';
import assert from 'node:assert/strict';

import { runToolLoop } from '../../llm/tool-loop-control.js';
import { recordingProvider, toolsTurn, toolResultsOf, noteOf, userMsg } from '../helpers/tool-loop-fakes.js';

// runToolLoop：不该执行的调用、重复失败保护、结束说明

test('runToolLoop: 中途 kind=fallback → 说明里附已执行的操作清单', async () => {
  const rec = recordingProvider((iter) => (iter === 0 ? toolsTurn([{ name: 'foo', arguments: { a: 1 } }]) : { kind: 'fallback' }));
  const loopRef = {};
  const out = await runToolLoop({
    provider: rec.provider,
    messages: [{ role: 'system', content: 's' }, { role: 'assistant', content: 'prev' }],
    toolDefs: [],
    toolHandlers: { foo: async () => 'foo-result' },
    config: { loopRef },
    completeResultMode: 'detail',
  });
  assert.equal(out.text, 'no-tools-text');
  const sent = rec.noToolsMessages[0];
  // 末条不是 user 消息时，说明单独成一条 user 消息；无工具补全拿到的消息里不含工具历史
  assert.equal(sent.length, 3);
  assert.equal(sent.some((m) => m.role === 'tool'), false);
  assert.match(noteOf(sent), /中途拒绝了工具调用请求/);
  assert.match(noteOf(sent), /1\. \[成功\] foo \{"a":1\} → foo-result/);
  assert.match(noteOf(sent), /哪些部分已经完成、哪些部分没有完成/);
  assert.deepEqual(loopRef, { stopReason: 'fallback_midway', toolCallCount: 1 });
  // detail 模式返回的仍是带工具历史的消息
  assert.equal(out.messages.at(-1).role, 'tool');
});

test('runToolLoop: 参数解析失败或参数不是对象的调用不执行，原因回填给模型', async () => {
  let handlerCalls = 0;
  const rec = recordingProvider((iter) => (iter === 0
    ? toolsTurn([
      { name: 'foo', arguments: {}, argumentsError: 'Unexpected end of JSON input；收到的参数开头：{"a":' },
      { name: 'foo', arguments: [1, 2] },
      { name: 'foo', arguments: { ok: true } },
    ])
    : { kind: 'text', text: 'done' }));
  const loopRef = {};
  await runToolLoop({
    provider: rec.provider,
    messages: userMsg,
    toolDefs: [],
    toolHandlers: { foo: async () => { handlerCalls += 1; return 'ran'; } },
    config: { loopRef },
  });
  const results = toolResultsOf(rec.turnStates[1]);
  assert.match(results[0], /^工具参数不是合法 JSON，未执行：Unexpected end of JSON input；收到的参数开头：\{"a":。请重新输出完整参数$/);
  assert.match(results[1], /^工具参数不是合法 JSON，未执行：.*JSON 对象.*请重新输出完整参数$/);
  assert.equal(results[2], 'ran');
  assert.equal(handlerCalls, 1);
  assert.equal(loopRef.toolCallCount, 1);
});

test('runToolLoop: 被截断那一轮的最后一个调用不执行', async () => {
  const ran = [];
  const rec = recordingProvider((iter) => (iter === 0
    ? toolsTurn([{ name: 'foo', arguments: { n: 1 } }, { name: 'foo', arguments: { n: 2 } }], { truncated: true })
    : { kind: 'text', text: 'done' }));
  await runToolLoop({
    provider: rec.provider,
    messages: userMsg,
    toolDefs: [],
    toolHandlers: { foo: async ({ n }) => { ran.push(n); return `ran-${n}`; } },
    config: {},
  });
  assert.deepEqual(ran, [1]);
  assert.deepEqual(toolResultsOf(rec.turnStates[1]), [
    'ran-1',
    '输出被截断（达到 max_tokens），该调用未执行；请减少单次调用的内容量后重发',
  ]);
});

test('runToolLoop: 未知工具名的回填列出可用工具名', async () => {
  const rec = recordingProvider((iter) => (iter === 0 ? toolsTurn([{ name: 'nope' }]) : { kind: 'text', text: 'done' }));
  await runToolLoop({
    provider: rec.provider,
    messages: userMsg,
    toolDefs: [],
    toolHandlers: { read: async () => 'r', update: async () => 'u' },
    config: {},
  });
  assert.deepEqual(toolResultsOf(rec.turnStates[1]), ['工具未定义：nope。可用工具：read、update']);
});

test('runToolLoop: 相同的失败调用第 2 次带提示，第 3 次结束循环', async () => {
  let handlerCalls = 0;
  const rec = recordingProvider((iter) => toolsTurn([{ id: `t${iter}`, name: 'update', arguments: { ref: 'entry:1' } }]));
  const loopRef = {};
  const out = await runToolLoop({
    provider: rec.provider,
    messages: userMsg,
    toolDefs: [],
    toolHandlers: { update: async () => { handlerCalls += 1; return { success: false, error: '找不到 entry:1' }; } },
    config: { loopRef, maxIterations: 10 },
    completeResultMode: 'detail',
  });
  assert.equal(out.text, 'no-tools-text');
  assert.equal(rec.turnCalls, 3);
  assert.equal(handlerCalls, 3);
  const results = toolResultsOf(out.messages);
  assert.equal(results.length, 3);
  assert.doesNotMatch(results[0], /完全相同的调用再次失败/);
  assert.match(results[1], /找不到 entry:1.*\n与上一次完全相同的调用再次失败，请修改参数或放弃这一步$/);
  assert.match(results[2], /完全相同的调用再次失败/);
  assert.deepEqual(loopRef, { stopReason: 'repeated_failure', toolCallCount: 3 });
  const note = noteOf(rec.noToolsMessages[0]);
  assert.match(note, /连续 3 次以相同方式失败/);
  assert.match(note, /3\. \[失败\] update \{"ref":"entry:1"\}/);
});

test('runToolLoop: 第 3 次相同失败出现在一轮中间时，本轮剩余调用不执行', async () => {
  const ran = [];
  const failing = { name: 'boom', arguments: { k: 1 } };
  const rec = recordingProvider(() => toolsTurn([failing, failing, failing, { name: 'after' }]));
  const loopRef = {};
  const out = await runToolLoop({
    provider: rec.provider,
    messages: userMsg,
    toolDefs: [],
    toolHandlers: {
      boom: async () => { ran.push('boom'); throw new Error('kaboom'); },
      after: async () => { ran.push('after'); return 'r'; },
    },
    config: { loopRef },
    completeResultMode: 'detail',
  });
  assert.deepEqual(ran, ['boom', 'boom', 'boom']);
  assert.equal(rec.turnCalls, 1);
  assert.equal(loopRef.stopReason, 'repeated_failure');
  assert.match(toolResultsOf(out.messages)[3], /^未执行/);
});

test('runToolLoop: 中间有不同调用时重复失败计数清零', async () => {
  const fail = { name: 'bad', arguments: { k: 1 } };
  const script = [
    toolsTurn([fail]),
    toolsTurn([fail]),
    toolsTurn([{ name: 'good' }]),
    toolsTurn([fail]),
    toolsTurn([{ name: 'bad', arguments: { k: 2 } }]),
    toolsTurn([fail]),
    { kind: 'text', text: 'done' },
  ];
  const rec = recordingProvider((iter) => script[iter]);
  const loopRef = {};
  const out = await runToolLoop({
    provider: rec.provider,
    messages: userMsg,
    toolDefs: [],
    toolHandlers: { bad: async () => { throw new Error('nope'); }, good: async () => 'fine' },
    config: { loopRef },
    completeResultMode: 'detail',
  });
  assert.equal(out.text, 'done');
  assert.equal(loopRef.stopReason, 'completed');
  const hinted = toolResultsOf(out.messages).map((r) => /完全相同的调用再次失败/.test(r));
  assert.deepEqual(hinted, [false, true, false, false, false, false]);
});
