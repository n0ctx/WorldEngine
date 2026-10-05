import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVIDER_THINKING_LEVELS } from '../../../shared/thinking-levels.mjs';

// 走 Anthropic / Gemini 适配器的 provider：思考档位写进请求体的方式，以及档位表与后端的对齐。
process.env.LOG_FILE = 'false';

const OK_RESPONSES = {
  anthropic: { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' },
  gemini: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] },
};

async function captureRequest(config) {
  const adapter = config.provider === 'gemini' ? 'gemini' : 'anthropic';
  const { completeAnthropic } = await import('../../llm/providers/anthropic/index.js');
  const { completeGemini } = await import('../../llm/providers/gemini/index.js');
  const complete = adapter === 'gemini' ? completeGemini : completeAnthropic;
  const originalFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (_url, init) => {
    captured = { body: JSON.parse(init.body), headers: init.headers };
    return new Response(JSON.stringify(OK_RESPONSES[adapter]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    await complete([{ role: 'user', content: 'hi' }], config);
  } finally {
    globalThis.fetch = originalFetch;
  }
  return captured;
}

async function captureBody(config) {
  return (await captureRequest(config)).body;
}

const baseConfig = { api_key: 'test-key', max_tokens: 64, temperature: 0.5 };
const kimiConfig = { ...baseConfig, provider: 'kimi-coding', model: 'k3' };
const anthropicConfig = { ...baseConfig, provider: 'anthropic', model: 'claude-opus-5-5' };
const minimaxConfig = { ...baseConfig, provider: 'minimax-coding', model: 'MiniMax-M3' };
const geminiConfig = { ...baseConfig, provider: 'gemini', model: 'gemini-3-flash' };

test('kimi-coding 强度档 → output_config.effort，抑制 temperature', async () => {
  const body = await captureBody({ ...kimiConfig, thinking_level: 'effort_max' });
  assert.deepEqual(body.output_config, { effort: 'max' });
  assert.equal(body.thinking, undefined);
  assert.equal(body.reasoning_effort, undefined);
  assert.equal(body.temperature, undefined);
});

test('kimi-coding 关闭 → thinking.type=disabled，保留 temperature', async () => {
  const body = await captureBody({ ...kimiConfig, thinking_level: 'thinking_disabled' });
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.equal(body.output_config, undefined);
  assert.equal(body.temperature, 0.5);
});

test('kimi-coding 遗留 budget_* 不下发思考字段，保留 temperature', async () => {
  const body = await captureBody({ ...kimiConfig, thinking_level: 'budget_low' });
  assert.equal(body.thinking, undefined);
  assert.equal(body.output_config, undefined);
  assert.equal(body.temperature, 0.5);
});

test('anthropic：Opus 4.7 起、Sonnet 5 起、Fable 不发 temperature，更早的模型照常发', async () => {
  const cases = [
    ['claude-opus-4-7', undefined],
    ['claude-opus-5', undefined],
    ['claude-sonnet-5-5', undefined],
    ['claude-fable-5-1', undefined],
    ['claude-opus-4-6', 0.5],
    ['claude-sonnet-4-6', 0.5],
    ['claude-sonnet-4-5-20250929', 0.5],
    ['claude-opus-4-20250514', 0.5],
    ['claude-haiku-4-5', 0.5],
    ['claude-3-5-sonnet-20241022', 0.5],
  ];
  for (const [model, expected] of cases) {
    const body = await captureBody({ ...anthropicConfig, model, thinking_level: null });
    assert.equal(body.temperature, expected, model);
  }
});

test('anthropic 工具调用请求同样按模型决定是否发 temperature', async () => {
  const { completeAnthropicWithTools } = await import('../../llm/providers/anthropic/index.js');
  const originalFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(JSON.stringify(OK_RESPONSES.anthropic), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const tools = [{ type: 'function', function: { name: 'noop', description: 'noop', parameters: { type: 'object', properties: {} } } }];
  try {
    for (const model of ['claude-opus-5-5', 'claude-sonnet-4-6']) {
      await completeAnthropicWithTools([{ role: 'user', content: 'hi' }], tools, { noop: async () => 'ok' }, { ...anthropicConfig, model });
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.deepEqual(bodies.map((body) => [body.model, body.temperature]), [
    ['claude-opus-5-5', undefined],
    ['claude-sonnet-4-6', 0.5],
  ]);
});

test('anthropic 强度档 → adaptive + output_config.effort，不带交错思考 beta 头', async () => {
  const { body, headers } = await captureRequest({ ...anthropicConfig, thinking_level: 'effort_xhigh' });
  assert.deepEqual(body.thinking, { type: 'adaptive' });
  assert.deepEqual(body.output_config, { effort: 'xhigh' });
  assert.equal(body.temperature, undefined);
  assert.doesNotMatch(headers['anthropic-beta'], /interleaved-thinking/);
});

test('anthropic 预算档仍下发 thinking.budget_tokens 与交错思考 beta 头', async () => {
  const { body, headers } = await captureRequest({ ...anthropicConfig, model: 'claude-sonnet-4-5', thinking_level: 'budget_low' });
  assert.deepEqual(body.thinking, { type: 'enabled', budget_tokens: 1024 });
  assert.equal(body.output_config, undefined);
  assert.equal(body.temperature, undefined);
  assert.match(headers['anthropic-beta'], /interleaved-thinking/);
});

test('minimax-coding 开启发 adaptive，关闭发 disabled 并保留 temperature', async () => {
  const on = await captureBody({ ...minimaxConfig, thinking_level: 'thinking_enabled' });
  assert.deepEqual(on.thinking, { type: 'adaptive' });
  assert.equal(on.temperature, undefined);

  const off = await captureBody({ ...minimaxConfig, thinking_level: 'thinking_disabled' });
  assert.deepEqual(off.thinking, { type: 'disabled' });
  assert.equal(off.temperature, 0.5);
});

test('minimax-coding 遗留 budget_* 不再下发 budget_tokens', async () => {
  const body = await captureBody({ ...minimaxConfig, thinking_level: 'budget_high' });
  assert.equal(body.thinking, undefined);
});

test('gemini 强度档 → thinkingLevel，预算档 → thinkingBudget，二者不同时出现', async () => {
  const level = await captureBody({ ...geminiConfig, thinking_level: 'effort_medium' });
  assert.deepEqual(level.generationConfig.thinkingConfig, { thinkingLevel: 'medium', includeThoughts: true });

  const budget = await captureBody({ ...geminiConfig, model: 'gemini-2.5-flash', thinking_level: 'budget_high' });
  assert.deepEqual(budget.generationConfig.thinkingConfig, { thinkingBudget: 16384, includeThoughts: true });
});

test('Anthropic / Gemini 适配器：档位表里的每个档位都写出了请求字段', async () => {
  const configs = { anthropic: anthropicConfig, gemini: geminiConfig, 'kimi-coding': kimiConfig, 'minimax-coding': minimaxConfig };
  for (const [provider, config] of Object.entries(configs)) {
    for (const { value } of PROVIDER_THINKING_LEVELS[provider]) {
      const body = await captureBody({ ...config, thinking_level: value });
      const written = body.thinking ?? body.output_config ?? body.generationConfig?.thinkingConfig;
      assert.ok(written, `${provider} ${value}`);
    }
  }
});
