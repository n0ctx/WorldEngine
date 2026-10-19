import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';

const ctx = createRouteTestContext('config-provider-route-suite', {
  provider_keys: { mock: 'secret-key' },
  llm: { provider: 'mock', model: 'mock-model' },
});

after(() => ctx.close());

async function requestModelsWithFetch(llm, providerKeys, handler) {
  // 服务启动时会替换 globalThis.fetch，先启动再挂 mock
  await ctx.ensureServer();
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.startsWith('http://127.0.0.1:')) return originalFetch(url, init);
    requested.push(target);
    return handler(target, init);
  };
  ctx.sandbox.writeConfig({
    ...ctx.sandbox.readConfig(),
    provider_keys: providerKeys,
    llm: { ...ctx.sandbox.readConfig().llm, model: '', base_url: '', ...llm },
  });
  try {
    const res = await ctx.request('/api/config/models');
    return { status: res.status, data: await res.json(), requested };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const jsonResponse = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('GET /api/config/models 对 LM Studio 默认地址按 /v1/models 拉取', async () => {
  const { status, data, requested } = await requestModelsWithFetch({ provider: 'lmstudio' }, {}, () => jsonResponse({ data: [{ id: 'local-model' }] }));
  assert.equal(status, 200);
  assert.deepEqual(data.models.map((m) => m.id), ['local-model']);
  assert.deepEqual(requested, ['http://localhost:1234/v1/models']);
});

test('GET /api/config/models 对 Gemini 用填写的接口地址，无 Key 时不发请求', async () => {
  const handler = (target, init) => {
    assert.equal(init.headers['x-goog-api-key'], 'test-key');
    return jsonResponse({ models: [{ name: 'models/gemini-x' }] });
  };
  const custom = await requestModelsWithFetch(
    { provider: 'gemini', base_url: 'https://gemini-proxy.example.com' },
    { gemini: 'test-key' },
    (target, init) => (target.startsWith('https://ai.google.dev/') ? new Response('', { status: 503 }) : handler(target, init)),
  );
  assert.equal(custom.status, 200);
  assert.deepEqual(custom.data.models.map((m) => m.id), ['gemini-x']);
  assert.ok(custom.requested.includes('https://gemini-proxy.example.com/v1beta/models'));

  const noKey = await requestModelsWithFetch({ provider: 'gemini' }, {}, handler);
  assert.equal(noKey.status, 502);
  assert.deepEqual(noKey.requested, []);
});

test('GET /api/config/models 对 kimi-coding 按填写的接口地址拉取模型列表', async () => {
  const { status, data, requested } = await requestModelsWithFetch(
    { provider: 'kimi-coding', base_url: 'https://kimi-proxy.example.com/coding' },
    { 'kimi-coding': 'test-key' },
    () => jsonResponse({ data: [{ id: 'k3' }] }),
  );
  assert.equal(status, 200);
  assert.deepEqual(data.models.map((m) => m.id), ['k3']);
  assert.deepEqual(requested, ['https://kimi-proxy.example.com/coding/v1/models']);
});

test('PUT /api/config 拒绝未知服务商', async () => {
  const res = await ctx.request('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ llm: { provider: 'openai_compatible' } }),
  });
  assert.equal(res.status, 400);
  assert.notEqual(ctx.sandbox.readConfig().llm.provider, 'openai_compatible');
});
