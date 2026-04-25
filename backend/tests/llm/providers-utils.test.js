import test from 'node:test';
import assert from 'node:assert/strict';

import { parseSSE } from '../../llm/providers/_utils.js';

test('parseSSE 支持 Web ReadableStream 返回体', async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('event: content_block_delta\n'));
      controller.enqueue(encoder.encode('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"测试"}}\n\n'));
      controller.close();
    },
  });

  const events = [];
  for await (const evt of parseSSE(stream)) {
    events.push(evt);
  }

  assert.deepEqual(events, [
    {
      event: 'content_block_delta',
      data: '{"type":"content_block_delta","delta":{"type":"text_delta","text":"测试"}}',
    },
  ]);
});

test('parseSSE 会处理流结束前未以空行收尾的最后一个事件', async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('event: content_block_delta\n'));
      controller.enqueue(encoder.encode('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"尾块"}}'));
      controller.close();
    },
  });

  const events = [];
  for await (const evt of parseSSE(stream)) {
    events.push(evt);
  }

  assert.deepEqual(events, [
    {
      event: 'content_block_delta',
      data: '{"type":"content_block_delta","delta":{"type":"text_delta","text":"尾块"}}',
    },
  ]);
});

test('parseSSE 兼容冒号后无空格的 SSE 行格式', async () => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('event:content_block_delta\n'));
      controller.enqueue(encoder.encode('data:{"type":"content_block_delta","delta":{"type":"text_delta","text":"Kimi"}}\n\n'));
      controller.close();
    },
  });

  const events = [];
  for await (const evt of parseSSE(stream)) {
    events.push(evt);
  }

  assert.deepEqual(events, [
    {
      event: 'content_block_delta',
      data: '{"type":"content_block_delta","delta":{"type":"text_delta","text":"Kimi"}}',
    },
  ]);
});
