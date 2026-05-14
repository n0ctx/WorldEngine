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

test('GET /api/config/models 会为 Gemini 模型列表合并动态价格', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.startsWith('http://127.0.0.1:')) return originalFetch(url, init);
    if (target === 'https://ai.google.dev/gemini-api/docs/pricing') {
      return new Response([
        'gemini-2.5-pro Standard Input price $1.25 Output price $10.00 Context caching price $0.125 gemini-2.5-flash',
        'gemini-2.5-flash Standard Input price $0.30 Output price $2.50 Context caching price $0.03 gemini-2.5-flash-lite',
        'gemini-2.5-flash-lite Standard Input price $0.10 Output price $0.40 Context caching price $0.01 gemini-2.5-flash-lite-preview-09-2025',
        'gemini-2.5-flash-lite-preview-09-2025 Standard Input price $0.10 Output price $0.40 Context caching price $0.01 gemini-2.5-flash-native-audio-preview-12-2025',
        'gemini-2.0-flash Standard Input price $0.10 Output price $0.40 Context caching price $0.025 gemini-2.0-flash-lite',
        'gemini-2.0-flash-lite Standard Input price $0.075 Output price $0.30 Context caching price Not available Imagen 4',
      ].join(' '), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    if (target.startsWith('https://generativelanguage.googleapis.com/v1beta/models?key=')) {
      return new Response(JSON.stringify({
        models: [
          { name: 'models/gemini-2.5-flash' },
          { name: 'models/gemini-2.5-flash-lite-preview-09-2025' },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch: ${target}`);
  };

  ctx.sandbox.writeConfig({
    ...ctx.sandbox.readConfig(),
    provider_keys: { gemini: 'test-key' },
    llm: {
      ...ctx.sandbox.readConfig().llm,
      provider: 'gemini',
      model: '',
      base_url: '',
    },
  });

  try {
    const res = await ctx.request('/api/config/models');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data.models, [
      { id: 'gemini-2.5-flash', inputPrice: 0.3, outputPrice: 2.5, cacheReadPrice: 0.03 },
      { id: 'gemini-2.5-flash-lite-preview-09-2025', inputPrice: 0.1, outputPrice: 0.4, cacheReadPrice: 0.01 },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GET /api/config/models 会为 DeepSeek 模型列表合并 current 与 legacy 动态价格', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.startsWith('http://127.0.0.1:')) return originalFetch(url, init);
    if (target === 'https://api-docs.deepseek.com/quick_start/pricing') {
      return new Response(
        '1M INPUT TOKENS (CACHE HIT) $0.0028 $0.003625 1M INPUT TOKENS (CACHE MISS) $0.14 $0.435 1M OUTPUT TOKENS $0.28 $0.87',
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }
    if (target === 'https://api-docs.deepseek.com/quick_start/pricing-details-usd') {
      return new Response(
        'deepseek-chat 64K 8K $0.07 $0.27 $1.10 deepseek-reasoner 64K 32K 8K $0.14 $0.55 $2.19',
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }
    if (target === 'https://api.deepseek.com/models') {
      return new Response(JSON.stringify({
        data: [
          { id: 'deepseek-v4-flash' },
          { id: 'deepseek-chat' },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch: ${target}`);
  };

  ctx.sandbox.writeConfig({
    ...ctx.sandbox.readConfig(),
    provider_keys: { deepseek: 'test-key' },
    llm: {
      ...ctx.sandbox.readConfig().llm,
      provider: 'deepseek',
      model: '',
      base_url: '',
    },
  });

  try {
    const res = await ctx.request('/api/config/models');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data.models, [
      { id: 'deepseek-v4-flash', inputPrice: 0.14, outputPrice: 0.28, cacheReadPrice: 0.0028 },
      { id: 'deepseek-chat', inputPrice: 0.27, outputPrice: 1.1, cacheReadPrice: 0.07 },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GET /api/config 会为当前 Grok 模型返回动态价格', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.startsWith('http://127.0.0.1:')) return originalFetch(url, init);
    if (target === 'https://docs.x.ai/developers/pricing') {
      return new Response(
        'grok-4.3 1M $1.25 $0.20 $2.50 grok-4.20-multi-agent-0309 2M $1.25 $0.20 $2.50 grok-4-1-fast-reasoning 2M $0.20 $0.05 $0.50',
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }
    throw new Error(`unexpected fetch: ${target}`);
  };

  ctx.sandbox.writeConfig({
    ...ctx.sandbox.readConfig(),
    provider_keys: { grok: 'test-key' },
    llm: {
      ...ctx.sandbox.readConfig().llm,
      provider: 'grok',
      model: 'grok-4.3',
      base_url: '',
    },
  });

  try {
    const res = await ctx.request('/api/config');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data.llm.model_pricing, {
      inputPrice: 1.25,
      outputPrice: 2.5,
      cacheWritePrice: null,
      cacheReadPrice: 0.2,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GET /api/config/models 会为 Kimi 模型列表合并动态价格', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.startsWith('http://127.0.0.1:')) return originalFetch(url, init);
    if (target === 'https://platform.kimi.com/') {
      return new Response([
        'kimi-k2.6 是 Kimi 最新最智能的模型 缓存命中 ¥1.10 / MTok 输入 ¥6.50 / MTok 输出 ¥27.00 / MTok',
        'kimi-k2.5 支持视觉与文本输入、思考与非思考模式、对话与 Agent 任务 缓存命中 ¥0.70 / MTok 输入 ¥4.00 / MTok 输出 ¥21.00 / MTok',
        'kimi-k2 是一款具备超强代码和 Agent 能力的 MoE 架构基础模型 缓存命中 ¥1.00 / MTok 输入 ¥4.00 / MTok 输出 ¥16.00 / MTok',
      ].join(' '), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    if (target === 'https://api.moonshot.cn/v1/models') {
      return new Response(JSON.stringify({
        data: [
          { id: 'kimi-k2.6' },
          { id: 'kimi-k2-turbo-preview' },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch: ${target}`);
  };

  ctx.sandbox.writeConfig({
    ...ctx.sandbox.readConfig(),
    provider_keys: { kimi: 'test-key' },
    llm: {
      ...ctx.sandbox.readConfig().llm,
      provider: 'kimi',
      model: '',
      base_url: '',
    },
  });

  try {
    const res = await ctx.request('/api/config/models');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data.models, [
      { id: 'kimi-k2.6', inputPrice: 6.5, outputPrice: 27, cacheReadPrice: 1.1 },
      { id: 'kimi-k2-turbo-preview', inputPrice: 4, outputPrice: 16, cacheReadPrice: 1 },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GET /api/config/models 会为 Qwen 模型列表合并动态价格', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.startsWith('http://127.0.0.1:')) return originalFetch(url, init);
    if (target === 'https://help.aliyun.com/zh/model-studio/billing-for-model-studio') {
      return new Response([
        'qwen-turbo 当前能力等同于 qwen-turbo-2025-04-28 Batch 调用 半价 非思考和思考模式 0.3 元 0.6 元 3 元',
        'qwen-plus 当前能力等同于 qwen-plus-2025-12-01 Batch 调用 半价 0<Token≤128K 0.8 元 2 元 8 元 128K<Token≤256K 2.4 元 20 元 24 元',
        'qwen-max 当前能力等同于 qwen-max-2024-09-19 Batch 调用 半价 仅非思考模式 无阶梯计价 2.4 元 9.6 元',
        'qwen3-coder-plus 当前能力等同于 qwen3-coder-plus-2025-09-23 上下文缓存 享有折扣 0<Token≤32K 4 元 16 元',
      ].join(' '), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    if (target === 'https://dashscope.aliyuncs.com/compatible-mode/v1/models') {
      return new Response(JSON.stringify({
        data: [
          { id: 'qwen-turbo-2025-07-15' },
          { id: 'qwen-plus' },
          { id: 'qwen-max-latest' },
          { id: 'qwen3-coder-plus-2025-09-23' },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch: ${target}`);
  };

  ctx.sandbox.writeConfig({
    ...ctx.sandbox.readConfig(),
    provider_keys: { qwen: 'test-key' },
    llm: {
      ...ctx.sandbox.readConfig().llm,
      provider: 'qwen',
      model: '',
      base_url: '',
    },
  });

  try {
    const res = await ctx.request('/api/config/models');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data.models, [
      { id: 'qwen-turbo-2025-07-15', inputPrice: 0.3, outputPrice: 0.6 },
      { id: 'qwen-plus', inputPrice: 0.8, outputPrice: 2 },
      { id: 'qwen-max-latest', inputPrice: 2.4, outputPrice: 9.6 },
      { id: 'qwen3-coder-plus-2025-09-23', inputPrice: 4, outputPrice: 16 },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GET /api/config/models 会为 SiliconFlow 模型列表合并动态价格', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.startsWith('http://127.0.0.1:')) return originalFetch(url, init);
    if (target === 'https://docs.siliconflow.cn/cn/userguide/guides/batch') {
      return new Response(
        'SiliconFlow 平台推理模型价格表（单位：￥/百万 Tokens） 模型名称 实时推理 - 输入 实时推理 - 输出 批量推理 - 输入 批量推理 - 输出 deepseek-ai/DeepSeek-V3.1-Terminus ¥4 ¥12 ¥2 ¥6 moonshotai/Kimi-K2-Instruct-0905 ¥4 ¥16 ¥2 ¥8 MiniMaxAI/MiniMax-M2 ¥2.1 ¥8.4 ¥2.1 ¥8.4 Qwen/Qwen3-235B-A22B-Thinking-2507 ¥2.5 ¥10 ¥2.5 ¥10',
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }
    if (target === 'https://api.siliconflow.cn/v1/models') {
      return new Response(JSON.stringify({
        data: [
          { id: 'MiniMaxAI/MiniMax-M2' },
          { id: 'Qwen/Qwen3-235B-A22B' },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch: ${target}`);
  };

  ctx.sandbox.writeConfig({
    ...ctx.sandbox.readConfig(),
    provider_keys: { siliconflow: 'test-key' },
    llm: {
      ...ctx.sandbox.readConfig().llm,
      provider: 'siliconflow',
      model: '',
      base_url: '',
    },
  });

  try {
    const res = await ctx.request('/api/config/models');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data.models, [
      { id: 'MiniMaxAI/MiniMax-M2', inputPrice: 2.1, outputPrice: 8.4 },
      { id: 'Qwen/Qwen3-235B-A22B', inputPrice: 2.5, outputPrice: 10 },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
