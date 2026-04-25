import test from 'node:test';
import assert from 'node:assert/strict';

import { chatAssistant, __testables } from '../client/api.js';

test('processSseBlock 会解析 assistant SSE 事件', () => {
  const calls = [];
  __testables.processSseBlock('data: {"type":"tool_call","name":"preview_card"}', {
    onToolCall(name) {
      calls.push(['tool_call', name]);
    },
  });

  assert.deepEqual(calls, [['tool_call', 'preview_card']]);
});

test('chatAssistant 会在流结束时处理 buffer 中残留的最后一个 SSE 事件', async () => {
  const encoder = new TextEncoder();
  const chunks = [
    'data: {"delta":"你"}\n',
    'data: {"done":true}',
  ];

  global.fetch = async () => ({
    ok: true,
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
  });

  const deltas = [];
  let done = 0;
  let streamEnd = 0;

  await new Promise((resolve) => {
    chatAssistant({ message: 'hi' }, {
      onDelta(delta) {
        deltas.push(delta);
      },
      onDone() {
        done += 1;
      },
      onStreamEnd() {
        streamEnd += 1;
        resolve();
      },
    });
  });

  assert.deepEqual(deltas, ['你']);
  assert.equal(done, 1);
  assert.equal(streamEnd, 1);
});
