import test from 'node:test';
import assert from 'node:assert/strict';

process.env.LOG_FILE = 'false';
const { streamAnthropic } = await import('../../llm/providers/anthropic/index.js');

function responseFromEvents(events) {
  const body = events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const baseConfig = () => ({
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
  api_key: 'test-key',
  base_url: 'https://anthropic.example',
});

test('streamAnthropic preserves request options, thinking output, usage, and stop signals', async () => {
  const originalFetch = globalThis.fetch;
  const usageRef = {};
  const signals = [];
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init, body: JSON.parse(init.body) };
    return responseFromEvents([
      ['message_start', { message: { usage: { input_tokens: 14, cache_read_input_tokens: 3 } } }],
      ['content_block_start', { content_block: { type: 'thinking' } }],
      ['content_block_delta', { delta: { type: 'thinking_delta', thinking: 'analysis' } }],
      ['content_block_stop', {}],
      ['content_block_start', { content_block: { type: 'text' } }],
      ['content_block_delta', { delta: { type: 'text_delta', text: 'answer' } }],
      ['message_delta', { usage: { output_tokens: 7 }, delta: { stop_reason: 'max_tokens' } }],
    ]);
  };

  const config = {
    ...baseConfig(),
    max_tokens: 128,
    temperature: 0.4,
    thinking_level: 'budget_low',
    cacheableSystem: 'stable',
    usageRef,
    onProviderSignal: async (signal) => signals.push(signal),
  };

  try {
    const chunks = [];
    for await (const chunk of streamAnthropic([
      { role: 'system', content: 'stable\n\nlive' },
      { role: 'user', content: 'hi' },
    ], config)) chunks.push(chunk);

    assert.deepEqual(chunks, ['<think>', 'analysis', '</think>', 'answer']);
    assert.equal(request.url, 'https://anthropic.example/v1/messages');
    assert.equal(request.init.headers['x-api-key'], 'test-key');
    assert.equal(request.init.headers['anthropic-version'], '2023-06-01');
    assert.match(request.init.headers['anthropic-beta'], /prompt-caching/);
    assert.match(request.init.headers['anthropic-beta'], /interleaved-thinking/);
    assert.deepEqual(request.body, {
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 128,
      stream: true,
      thinking: { type: 'enabled', budget_tokens: 1024 },
      system: [
        { type: 'text', text: 'stable', cache_control: { type: 'ephemeral' } },
        { type: 'text', text: 'live' },
      ],
    });
    assert.deepEqual(usageRef, {
      prompt_tokens: 14,
      cache_read_tokens: 3,
      completion_tokens: 7,
    });
    assert.equal(signals.length, 1);
    assert.equal(signals[0].signalName, 'anthropic_max_tokens');
    assert.equal(signals[0].phase, 'stream_stop');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('streamAnthropic closes an unfinished thinking block at end of stream', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => responseFromEvents([
    ['content_block_start', { content_block: { type: 'thinking' } }],
    ['content_block_delta', { delta: { type: 'thinking_delta', thinking: 'partial' } }],
  ]);

  try {
    const chunks = [];
    for await (const chunk of streamAnthropic([{ role: 'user', content: 'hi' }], baseConfig())) {
      chunks.push(chunk);
    }
    assert.deepEqual(chunks, ['<think>', 'partial', '</think>']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('streamAnthropic keeps HTTP status and response text on request errors', async () => {
  const originalFetch = globalThis.fetch;
  const signals = [];
  globalThis.fetch = async () => ({
    ok: false,
    status: 429,
    text: async () => 'rate limited',
  });

  try {
    const iterator = streamAnthropic([{ role: 'user', content: 'hi' }], {
      ...baseConfig(),
      onProviderSignal: async (signal) => signals.push(signal),
    });
    await assert.rejects(iterator.next(), (error) => {
      assert.equal(error.status, 429);
      assert.equal(error.message, 'Anthropic API error: 429 rate limited');
      return true;
    });
    assert.deepEqual(signals, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('streamAnthropic emits a safety signal for HTTP error bodies', async () => {
  const originalFetch = globalThis.fetch;
  const signals = [];
  const text = JSON.stringify({
    type: 'error',
    error: { type: 'safety_error', message: 'request blocked by safety policy' },
  });
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    text: async () => text,
  });

  try {
    const iterator = streamAnthropic([{ role: 'user', content: 'hi' }], {
      ...baseConfig(),
      onProviderSignal: async (signal) => signals.push(signal),
    });
    await assert.rejects(iterator.next(), (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.message, `Anthropic API error: 400 ${text}`);
      return true;
    });
    assert.equal(signals.length, 1);
    assert.equal(signals[0].signalName, 'anthropic_safety_error');
    assert.equal(signals[0].provider, 'anthropic');
    assert.equal(signals[0].phase, 'request_error');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
