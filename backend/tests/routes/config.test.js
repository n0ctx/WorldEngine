import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';

const ctx = createRouteTestContext('config-route-suite', {
  provider_keys: { mock: 'secret-key', openai: 'embed-secret' },
  llm: { provider: 'mock', model: 'mock-model' },
  embedding: { provider: 'openai', model: 'text-embedding-3-small' },
});

after(() => ctx.close());

test('GET /api/config 会隐藏真实 provider_keys 并暴露 has_key', async () => {

  const res = await ctx.request('/api/config');
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.llm.has_key, true);
  assert.equal(data.embedding.has_key, true);
  assert.equal(data.provider_keys.mock, true);
  assert.equal(data.provider_keys.openai, true);
});

test('PUT /api/config 在 provider 切换时恢复 provider_models 中缓存的 model', async () => {
  ctx.sandbox.writeConfig({
    ...ctx.sandbox.readConfig(),
    provider_keys: {},
    llm: {
      provider: 'openai',
      provider_models: { ollama: 'llama3.2' },
      model: 'gpt-4o-mini',
      base_url: '',
      max_tokens: 256,
      temperature: 0.6,
      thinking_level: null,
    },
    embedding: ctx.sandbox.readConfig().embedding,
  });

  const res = await ctx.request('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ llm: { provider: 'ollama', base_url: 'http://127.0.0.1:11434' } }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.llm.provider, 'ollama');
  assert.equal(data.llm.model, 'llama3.2');
  assert.equal(data.provider_keys.ollama, undefined);

  const saved = ctx.sandbox.readConfig();
  assert.equal(saved.llm.provider_models.openai, 'gpt-4o-mini');
});

test('PUT /api/config/provider-key 写入指定 provider 的 key 到顶层共享池', async () => {
  ctx.sandbox.writeConfig({
    ...ctx.sandbox.readConfig(),
    provider_keys: {},
    llm: {
      ...ctx.sandbox.readConfig().llm,
      provider: 'mock',
    },
    embedding: {
      ...ctx.sandbox.readConfig().embedding,
      provider: 'openai',
    },
  });

  let res = await ctx.request('/api/config/provider-key', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'mock', api_key: 'llm-key' }),
  });
  assert.equal(res.status, 200);

  res = await ctx.request('/api/config/provider-key', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'openai', api_key: 'embed-key' }),
  });
  assert.equal(res.status, 200);

  const saved = ctx.sandbox.readConfig();
  assert.equal(saved.provider_keys.mock, 'llm-key');
  assert.equal(saved.provider_keys.openai, 'embed-key');
  assert.equal(saved.llm.provider_keys, undefined);
  assert.equal(saved.embedding.provider_keys, undefined);
});

test('GET /api/config/models 对 coding plan provider 返回静态模型列表', async () => {
  ctx.sandbox.writeConfig({
    ...ctx.sandbox.readConfig(),
    provider_keys: {},
    llm: {
      ...ctx.sandbox.readConfig().llm,
      provider: 'minimax-coding',
      model: '',
      base_url: '',
    },
  });

  const res = await ctx.request('/api/config/models');
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.ok(data.models.some((m) => m.id === 'MiniMax-M2.7'));
  assert.ok(data.models.some((m) => m.id === 'MiniMax-M2'));
  assert.equal(data.thinkingOptions.length, 3);
});

test('GET /api/config/models 对 xiaomi provider 允许手填模型', async () => {
  ctx.sandbox.writeConfig({
    ...ctx.sandbox.readConfig(),
    provider_keys: {},
    llm: {
      ...ctx.sandbox.readConfig().llm,
      provider: 'xiaomi',
      model: '',
      base_url: 'https://api.example.com/v1',
    },
  });

  const res = await ctx.request('/api/config/models');
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.deepEqual(data.models, []);
  assert.equal(data.thinkingOptions.length, 0);
});

test('GET /api/config/test-connection 会识别 openai-compatible 的 200 + error JSON 鉴权失败', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('http://127.0.0.1:')) return originalFetch(url, init);
    return new Response(JSON.stringify({
      error: { message: 'The API Key appears to be invalid or may have expired.' },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  ctx.sandbox.writeConfig({
    ...ctx.sandbox.readConfig(),
    provider_keys: { 'glm-coding': 'test-key' },
    llm: {
      ...ctx.sandbox.readConfig().llm,
      provider: 'glm-coding',
      model: 'GLM-4.7',
      base_url: '',
    },
  });

  try {
    const res = await ctx.request('/api/config/test-connection');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.error, /invalid|expired/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
