import test from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';

// 独立成文件：services/config.js 的 CONFIG_PATH 在模块加载时固化，与其它用例同文件会读到已清理沙箱的路径。
// 端到端验证：副模型生成参数经 buildLLMConfig 合并后，按副模型自己的服务商写进请求体。
process.env.LOG_FILE = 'false';

const OK_BODY = { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] };

test('副模型温度/上限/采样：继承主模型，按副模型服务商过滤写进请求体', { concurrency: false }, async (t) => {
  const sandbox = createTestSandbox('aux-sampling-request-body', {
    provider_keys: { openrouter: 'k', glm: 'k', qwen: 'k' },
    llm: { provider: 'openrouter', model: 'chat', sampling: { top_p: 0.9 } },
    aux_llm: { provider: 'glm', model: 'aux', temperature: 0.3, max_tokens: 128, sampling: { top_k: 30 } },
  });
  t.after(() => {
    resetMockEnv();
    sandbox.cleanup();
  });
  sandbox.setEnv();

  const { complete } = await freshImport('backend/llm/index.js');
  const { updateConfig } = await freshImport('backend/services/config.js');
  updateConfig({});

  let body = null;
  const originalFetch = globalThis.fetch;
  const mockFetch = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify(OK_BODY), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const callAux = async () => {
    body = null;
    globalThis.fetch = mockFetch;
    try {
      await complete([{ role: 'user', content: 'hi' }], { configScope: 'aux' });
    } finally {
      globalThis.fetch = originalFetch;
    }
    return body;
  };

  // 主模型 openrouter（6 项采样全支持），副模型 glm（只支持 top_p）：
  // 温度/上限用副模型设的值；继承主模型的 top_p 写入；副模型设的 top_k 按副模型服务商过滤掉
  body = await callAux();
  assert.equal(body.temperature, 0.3);
  assert.equal(body.max_tokens, 128);
  assert.equal(body.top_p, 0.9);
  assert.equal('top_k' in body, false);

  // 副模型换支持 top_k 的服务商（qwen）：继承的 top_p 与副模型设的 top_k 都进请求体
  updateConfig({ aux_llm: { provider: 'qwen' } });
  body = await callAux();
  assert.equal(body.temperature, 0.3);
  assert.equal(body.max_tokens, 128);
  assert.equal(body.top_p, 0.9);
  assert.equal(body.top_k, 30);
});
