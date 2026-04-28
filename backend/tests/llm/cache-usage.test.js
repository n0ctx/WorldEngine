import test from 'node:test';
import assert from 'node:assert/strict';

import { getPromptCacheStrategy, recordTokenUsage } from '../../llm/providers/cache-usage.js';
import { OPENAI_COMPATIBLE } from '../../llm/providers/_utils.js';

test('getPromptCacheStrategy 覆盖全部云端预设 provider', () => {
  const expected = new Map([
    ['anthropic', 'anthropic-explicit'],
    ['kimi-coding', 'anthropic-explicit'],
    ['minimax-coding', 'anthropic-explicit'],
    ['openai', 'openai-prefix'],
    ['openrouter', 'openai-prefix'],
    ['glm', 'openai-prefix'],
    ['glm-coding', 'openai-prefix'],
    ['kimi', 'openai-prefix'],
    ['minimax', 'openai-prefix'],
    ['grok', 'openai-prefix'],
    ['siliconflow', 'openai-prefix'],
    ['qwen', 'openai-prefix'],
    ['xiaomi', 'openai-prefix'],
    ['deepseek', 'deepseek-prefix'],
    ['gemini', 'gemini-implicit'],
    ['ollama', 'local-or-unknown'],
    ['lmstudio', 'local-or-unknown'],
  ]);

  for (const [provider, strategy] of expected) {
    assert.equal(getPromptCacheStrategy(provider), strategy, provider);
  }
});

test('OpenAI-compatible 集合包含新增官方 provider', () => {
  assert.equal(OPENAI_COMPATIBLE.has('qwen'), true);
  assert.equal(OPENAI_COMPATIBLE.has('xiaomi'), true);
});

test('recordTokenUsage 标准化 Anthropic usage', () => {
  const usage = {};
  recordTokenUsage(usage, {
    input_tokens: 1000,
    output_tokens: 200,
    cache_creation_input_tokens: 800,
    cache_read_input_tokens: 600,
  }, 'anthropic');

  assert.deepEqual(usage, {
    prompt_tokens: 1000,
    completion_tokens: 200,
    cache_creation_tokens: 800,
    cache_read_tokens: 600,
  });
});

test('recordTokenUsage 标准化 OpenAI/Qwen cached_tokens', () => {
  const usage = {};
  recordTokenUsage(usage, {
    prompt_tokens: 1200,
    completion_tokens: 300,
    prompt_tokens_details: { cached_tokens: 1024 },
  }, 'qwen');

  assert.deepEqual(usage, {
    prompt_tokens: 1200,
    completion_tokens: 300,
    cache_read_tokens: 1024,
  });
});

test('recordTokenUsage 标准化 DeepSeek hit/miss tokens', () => {
  const usage = {};
  recordTokenUsage(usage, {
    prompt_tokens: 1500,
    completion_tokens: 250,
    prompt_cache_hit_tokens: 700,
    prompt_cache_miss_tokens: 800,
  }, 'deepseek');

  assert.deepEqual(usage, {
    prompt_tokens: 1500,
    completion_tokens: 250,
    cache_read_tokens: 700,
    cache_miss_tokens: 800,
  });
});

test('recordTokenUsage 标准化 Gemini usageMetadata', () => {
  const usage = {};
  recordTokenUsage(usage, {
    promptTokenCount: 2200,
    candidatesTokenCount: 400,
    cachedContentTokenCount: 1800,
  }, 'gemini');

  assert.deepEqual(usage, {
    prompt_tokens: 2200,
    completion_tokens: 400,
    cache_read_tokens: 1800,
  });
});
