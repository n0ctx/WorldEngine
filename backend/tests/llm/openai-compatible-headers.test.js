import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOpenAICompatibleHeaders, normalizeOpenAICompatibleMessages } from '../../llm/providers/openai-compatible.js';

test('grok provider 在有 conversationId 时附加 x-grok-conv-id header', () => {
  const headers = buildOpenAICompatibleHeaders({
    provider: 'grok',
    api_key: 'sk-test',
    conversationId: 'conv_abc123',
  });
  assert.equal(headers['x-grok-conv-id'], 'conv_abc123');
  assert.equal(headers.Authorization, 'Bearer sk-test');
  assert.equal(headers['Content-Type'], 'application/json');
});

test('grok provider 在缺少 conversationId 时不发送 x-grok-conv-id', () => {
  const headers = buildOpenAICompatibleHeaders({
    provider: 'grok',
    api_key: 'sk-test',
  });
  assert.equal(headers['x-grok-conv-id'], undefined);
});

test('非 grok provider 即便传入 conversationId 也不附加 x-grok-conv-id', () => {
  for (const provider of ['openai', 'openrouter', 'glm', 'kimi', 'deepseek']) {
    const headers = buildOpenAICompatibleHeaders({
      provider,
      api_key: 'sk-test',
      conversationId: 'conv_abc123',
    });
    assert.equal(headers['x-grok-conv-id'], undefined, `${provider} 不应附加 x-grok-conv-id`);
  }
});

test('conversationId 非字符串会被强制转换为字符串', () => {
  const headers = buildOpenAICompatibleHeaders({
    provider: 'grok',
    api_key: 'sk-test',
    conversationId: 12345,
  });
  assert.equal(headers['x-grok-conv-id'], '12345');
});

test('openrouter 会把首条 system 拆成稳定 cached prefix + 动态 system suffix', () => {
  const messages = [
    { role: 'system', content: 'stable-prefix\n\ndynamic-suffix' },
    { role: 'user', content: 'hello' },
  ];
  const normalized = normalizeOpenAICompatibleMessages(messages, {
    provider: 'openrouter',
    cacheableSystem: 'stable-prefix',
  });

  assert.deepEqual(normalized, [
    { role: 'system', content: 'stable-prefix' },
    { role: 'system', content: 'dynamic-suffix' },
    { role: 'user', content: 'hello' },
  ]);
});

test('openrouter 在首条 system 没有动态后缀时保持原样', () => {
  const messages = [
    { role: 'system', content: 'stable-prefix' },
    { role: 'user', content: 'hello' },
  ];
  const normalized = normalizeOpenAICompatibleMessages(messages, {
    provider: 'openrouter',
    cacheableSystem: 'stable-prefix',
  });

  assert.equal(normalized, messages);
});

test('非 openrouter provider 不拆 system，避免影响其他 provider cache 路径', () => {
  const messages = [
    { role: 'system', content: 'stable-prefix\n\ndynamic-suffix' },
    { role: 'user', content: 'hello' },
  ];
  const normalized = normalizeOpenAICompatibleMessages(messages, {
    provider: 'grok',
    cacheableSystem: 'stable-prefix',
  });

  assert.equal(normalized, messages);
});

test('openrouter 在首条 system 不匹配 cacheableSystem 时不拆分', () => {
  const messages = [
    { role: 'system', content: 'another-prefix\n\ndynamic-suffix' },
    { role: 'user', content: 'hello' },
  ];
  const normalized = normalizeOpenAICompatibleMessages(messages, {
    provider: 'openrouter',
    cacheableSystem: 'stable-prefix',
  });

  assert.equal(normalized, messages);
});
