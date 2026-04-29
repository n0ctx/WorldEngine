import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOpenAICompatibleHeaders } from '../../llm/providers/openai-compatible.js';

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
