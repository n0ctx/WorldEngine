import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';

const ctx = createRouteTestContext('config-route-suite', {
  llm: { provider: 'mock', provider_keys: { mock: 'secret-key' }, model: 'mock-model' },
  embedding: { provider: 'openai', provider_keys: { openai: 'embed-secret' }, model: 'text-embedding-3-small' },
});

after(() => ctx.close());

test('GET /api/config 会隐藏真实 provider_keys 并暴露 has_key', async () => {

  const res = await ctx.request('/api/config');
  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.llm.has_key, true);
  assert.equal(data.llm.provider_keys.mock, true);
  assert.equal(data.embedding.has_key, true);
  assert.equal(data.embedding.provider_keys.openai, true);
});

test('PUT /api/config 在 provider 切换时恢复 provider_models 中缓存的 model', async () => {
  ctx.sandbox.writeConfig({
    ...ctx.sandbox.readConfig(),
    llm: {
      provider: 'openai',
      provider_keys: {},
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
  assert.equal(data.llm.provider_keys.ollama, undefined);

  const saved = ctx.sandbox.readConfig();
  assert.equal(saved.llm.provider_models.openai, 'gpt-4o-mini');
});

test('PUT /api/config/apikey 与 /embedding-apikey 写入当前 provider 的 key', async () => {
  ctx.sandbox.writeConfig({
    ...ctx.sandbox.readConfig(),
    llm: {
      ...ctx.sandbox.readConfig().llm,
      provider: 'mock',
      provider_keys: {},
    },
    embedding: {
      ...ctx.sandbox.readConfig().embedding,
      provider: 'openai',
      provider_keys: {},
    },
  });

  let res = await ctx.request('/api/config/apikey', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: 'llm-key' }),
  });
  assert.equal(res.status, 200);

  res = await ctx.request('/api/config/embedding-apikey', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: 'embed-key' }),
  });
  assert.equal(res.status, 200);

  const saved = ctx.sandbox.readConfig();
  assert.equal(saved.llm.provider_keys.mock, 'llm-key');
  assert.equal(saved.embedding.provider_keys.openai, 'embed-key');
});
