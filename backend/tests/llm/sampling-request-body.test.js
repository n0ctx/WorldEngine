import test from 'node:test';
import assert from 'node:assert/strict';

import { completeOpenAICompatible } from '../../llm/providers/openai-compatible/index.js';
import { completeAnthropic } from '../../llm/providers/anthropic/index.js';
import { completeGemini } from '../../llm/providers/gemini/index.js';
import { complete as completeLocal } from '../../llm/providers/ollama/index.js';
import { normalizeSamplingValue } from '../../../shared/sampling-params.mjs';

// 采样参数按 shared/sampling-params.mjs 只写进支持的服务商，字段名按各家接口
process.env.LOG_FILE = 'false';

const OK_RESPONSES = {
  openai: { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] },
  anthropic: { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' },
  gemini: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] },
};

const ALL_SET = { top_p: 0.9, top_k: 40, min_p: 0.05, repetition_penalty: 1.1, presence_penalty: 0.3, frequency_penalty: 0.2 };

async function captureBody(complete, format, config) {
  const originalFetch = globalThis.fetch;
  let body = null;
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify(OK_RESPONSES[format]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await complete([{ role: 'user', content: 'hi' }], {
      api_key: 'k', model: 'm', max_tokens: 64, temperature: 0.5, sampling: ALL_SET, ...config,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  return body;
}

function pickSampling(body) {
  const keys = ['top_p', 'top_k', 'min_p', 'repetition_penalty', 'repeat_penalty', 'presence_penalty', 'frequency_penalty'];
  return Object.fromEntries(keys.filter((key) => key in body).map((key) => [key, body[key]]));
}

test('OpenAI 兼容服务商只写各自支持的采样参数', async () => {
  const cases = [
    ['openrouter', ALL_SET],
    ['qwen', { top_p: 0.9, top_k: 40, repetition_penalty: 1.1, presence_penalty: 0.3 }],
    ['siliconflow', { top_p: 0.9, top_k: 40, min_p: 0.05, frequency_penalty: 0.2 }],
    ['openai', { top_p: 0.9, presence_penalty: 0.3, frequency_penalty: 0.2 }],
    ['glm', { top_p: 0.9 }],
    ['deepseek', {}],
    ['kimi', {}],
  ];
  for (const [provider, expected] of cases) {
    const body = await captureBody(completeOpenAICompatible, 'openai', { provider });
    assert.deepEqual(pickSampling(body), expected, provider);
  }
});

test('OpenAI 思考开启时与 temperature 一起省略采样参数', async () => {
  const body = await captureBody(completeOpenAICompatible, 'openai', { provider: 'openai', thinking_level: 'effort_high' });
  assert.deepEqual(pickSampling(body), {});
  assert.equal(body.temperature, undefined);
});

test('llama.cpp / LM Studio 的重复惩罚字段名是 repeat_penalty', async () => {
  const llamacpp = await captureBody(completeLocal, 'openai', { provider: 'llamacpp' });
  assert.deepEqual(pickSampling(llamacpp), {
    top_p: 0.9, top_k: 40, min_p: 0.05, repeat_penalty: 1.1, presence_penalty: 0.3, frequency_penalty: 0.2,
  });
  const lmstudio = await captureBody(completeLocal, 'openai', { provider: 'lmstudio' });
  assert.deepEqual(pickSampling(lmstudio), { top_p: 0.9, top_k: 40, repeat_penalty: 1.1, presence_penalty: 0.3, frequency_penalty: 0.2 });
});

test('Gemini 写进 generationConfig 的 topP / topK', async () => {
  const body = await captureBody(completeGemini, 'gemini', { provider: 'gemini' });
  assert.equal(body.generationConfig.topP, 0.9);
  assert.equal(body.generationConfig.topK, 40);
  assert.equal('presencePenalty' in body.generationConfig, false);
});

test('Anthropic 格式：minimax-coding 只写 top_p，anthropic 不写', async () => {
  const minimax = await captureBody(completeAnthropic, 'anthropic', { provider: 'minimax-coding' });
  assert.deepEqual(pickSampling(minimax), { top_p: 0.9 });
  const anthropic = await captureBody(completeAnthropic, 'anthropic', { provider: 'anthropic', model: 'claude-opus-5-5' });
  assert.deepEqual(pickSampling(anthropic), {});
});

test('未设置的参数不发送', async () => {
  const body = await captureBody(completeOpenAICompatible, 'openai', { provider: 'openrouter', sampling: { top_p: null } });
  assert.deepEqual(pickSampling(body), {});
});

test('normalizeSamplingValue：越界夹到范围内，整数参数取整，空值与非数字为 null', () => {
  assert.equal(normalizeSamplingValue('top_p', 1.5), 1);
  assert.equal(normalizeSamplingValue('top_k', 40.6), 41);
  assert.equal(normalizeSamplingValue('presence_penalty', -3), -2);
  assert.equal(normalizeSamplingValue('top_p', ''), null);
  assert.equal(normalizeSamplingValue('top_p', 'abc'), null);
  assert.equal(normalizeSamplingValue('unknown', 1), null);
});
