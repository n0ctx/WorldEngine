import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';

const sandbox = createTestSandbox('model-context-limit');
sandbox.setEnv();
const { updateConfig } = await freshImport('backend/services/config.js');
const { resolveContextLimit, DEFAULT_CONTEXT_LIMIT } = await freshImport('backend/services/model-context-limit.js');

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
after(() => sandbox.cleanup());

function stubFetch(handler) {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    const body = handler(String(url));
    if (body instanceof Error) throw body;
    return { ok: true, status: 200, json: async () => body };
  };
  return urls;
}

function useLlm(llm, key = 'k') {
  updateConfig({ llm, provider_keys: { [llm.provider]: key } });
}

test('默认上限是 122880', () => {
  assert.equal(DEFAULT_CONTEXT_LIMIT, 122880);
});

test('OpenRouter：取模型列表里的 context_length，缓存命中后不再请求', async () => {
  useLlm({ provider: 'openrouter', model: 'vendor/big', base_url: '' });
  const urls = stubFetch(() => ({ data: [{ id: 'vendor/small', context_length: 8000 }, { id: 'vendor/big', context_length: 400000 }] }));
  assert.equal(await resolveContextLimit('main'), 400000);
  const fetched = urls.length;
  assert.equal(await resolveContextLimit('main'), 400000);
  assert.equal(urls.length, fetched);
});

test('Anthropic 取 max_input_tokens，Gemini 取 inputTokenLimit', async () => {
  useLlm({ provider: 'anthropic', model: 'claude-x', base_url: '' });
  stubFetch((url) => (url.includes('/v1/models') ? { data: [{ id: 'claude-x', max_input_tokens: 200000 }] } : {}));
  assert.equal(await resolveContextLimit('main'), 200000);

  useLlm({ provider: 'gemini', model: 'gemini-x', base_url: '' });
  stubFetch((url) => (url.includes('generativelanguage') ? { models: [{ name: 'models/gemini-x', inputTokenLimit: 1048576 }] } : {}));
  assert.equal(await resolveContextLimit('main'), 1048576);
});

test('llama.cpp 取 /props 的 n_ctx，LM Studio 取已加载模型的 loaded_context_length', async () => {
  useLlm({ provider: 'llamacpp', model: 'local-a', base_url: '' });
  let urls = stubFetch(() => ({ default_generation_settings: { n_ctx: 16384 } }));
  assert.equal(await resolveContextLimit('main'), 16384);
  assert.match(urls[0], /\/props$/);

  useLlm({ provider: 'lmstudio', model: 'local-b', base_url: '' });
  urls = stubFetch(() => ({ data: [{ id: 'local-b', loaded_context_length: 32768, max_context_length: 131072 }] }));
  assert.equal(await resolveContextLimit('main'), 32768);
  assert.match(urls[0], /\/api\/v0\/models$/);
});

test('取不到时回落默认值：接口没有该字段、请求失败、Ollama 不查询', async () => {
  useLlm({ provider: 'openrouter', model: 'vendor/no-field', base_url: '' });
  stubFetch(() => ({ data: [{ id: 'vendor/no-field' }] }));
  assert.equal(await resolveContextLimit('main'), DEFAULT_CONTEXT_LIMIT);

  useLlm({ provider: 'openrouter', model: 'vendor/down', base_url: '' });
  stubFetch(() => new Error('network down'));
  assert.equal(await resolveContextLimit('main'), DEFAULT_CONTEXT_LIMIT);

  useLlm({ provider: 'ollama', model: 'qwen', base_url: '' });
  const urls = stubFetch(() => ({}));
  assert.equal(await resolveContextLimit('main'), DEFAULT_CONTEXT_LIMIT);
  assert.equal(urls.length, 0);
});

test('副模型按副模型配置解析', async () => {
  useLlm({ provider: 'ollama', model: 'qwen', base_url: '' });
  updateConfig({ aux_llm: { provider: 'openrouter', model: 'vendor/aux', base_url: '' }, provider_keys: { openrouter: 'k' } });
  stubFetch(() => ({ data: [{ id: 'vendor/aux', context_length: 64000 }] }));
  assert.equal(await resolveContextLimit('aux'), 64000);
});
