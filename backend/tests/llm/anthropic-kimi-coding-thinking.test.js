import test from 'node:test';
import assert from 'node:assert/strict';

// kimi-coding（K3 / K2.8 Preview）的思考深度走 reasoning_effort: low/high/max，
// 不下发 Anthropic 的 thinking.budget_tokens；遗留 budget_* 配置一律忽略。
process.env.LOG_FILE = 'false';

async function captureBody(config) {
  const { completeAnthropic } = await import('../../llm/providers/anthropic/index.js');
  const originalFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (_url, init) => {
    captured = JSON.parse(init.body);
    return new Response(JSON.stringify({
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await completeAnthropic([{ role: 'user', content: 'hi' }], config);
  } finally {
    globalThis.fetch = originalFetch;
  }
  return captured;
}

const kimiConfig = {
  provider: 'kimi-coding',
  model: 'k3',
  api_key: 'test-key',
  max_tokens: 64,
  temperature: 0.5,
};

test('kimi-coding effort_max → reasoning_effort=max，抑制 temperature', async () => {
  const body = await captureBody({ ...kimiConfig, thinking_level: 'effort_max' });
  assert.equal(body.reasoning_effort, 'max');
  assert.equal(body.thinking, undefined);
  assert.equal(body.temperature, undefined);
});

test('kimi-coding effort_low → reasoning_effort=low', async () => {
  const body = await captureBody({ ...kimiConfig, thinking_level: 'effort_low' });
  assert.equal(body.reasoning_effort, 'low');
  assert.equal(body.thinking, undefined);
});

test('kimi-coding 遗留 budget_* 不下发 thinking 字段', async () => {
  const body = await captureBody({ ...kimiConfig, thinking_level: 'budget_low' });
  assert.equal(body.thinking, undefined);
  assert.equal(body.reasoning_effort, undefined);
  assert.equal(body.temperature, 0.5);
});

test('anthropic budget_* 仍下发 thinking.budget_tokens', async () => {
  const body = await captureBody({
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    api_key: 'test-key',
    max_tokens: 64,
    temperature: 0.5,
    thinking_level: 'budget_low',
  });
  assert.deepEqual(body.thinking, { type: 'enabled', budget_tokens: 1024 });
  assert.equal(body.reasoning_effort, undefined);
  assert.equal(body.temperature, undefined);
});
