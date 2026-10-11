import test from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';

// 独立成文件：services/config.js 的 CONFIG_PATH 在模块加载时固化，与其它用例同文件会读到已清理沙箱的路径。
test('buildLLMConfig：副模型生成参数继承对话主模型、副模型设置值优先、世界卡覆盖逐项生效', { concurrency: false }, async (t) => {
  const sandbox = createTestSandbox('llm-config-sampling', {
    provider_keys: { mock: 'secret' },
    llm: { provider: 'mock', model: 'chat', sampling: { top_p: 0.9 } },
    aux_llm: { provider: 'mock', model: 'aux' },
    writing: { llm: { provider: null } },
  });
  t.after(() => {
    resetMockEnv();
    sandbox.cleanup();
  });
  sandbox.setEnv();

  const { __testables } = await freshImport('backend/llm/index.js');
  const { updateConfig } = await freshImport('backend/services/config.js');
  assert.equal(__testables.buildLLMConfig({}).sampling.top_p, 0.9);
  // 副模型未设采样参数时逐项继承对话主模型（aux 与 writing-aux 回退链均落到 aux_llm，都未设采样）
  assert.deepEqual(__testables.buildLLMConfig({ configScope: 'aux' }).sampling, { top_p: 0.9 });
  assert.deepEqual(__testables.buildLLMConfig({ configScope: 'writing-aux' }).sampling, { top_p: 0.9 });
  assert.equal(__testables.buildLLMConfig({ configScope: 'writing' }).sampling.top_p, 0.9);
  // 世界卡传来的覆盖逐项盖过配置，未覆盖的项沿用配置
  const merged = __testables.buildLLMConfig({ sampling: { top_k: 20 } }).sampling;
  assert.equal(merged.top_p, 0.9);
  assert.equal(merged.top_k, 20);

  // 副模型设置值优先：设置过的键覆盖主模型，未设置的键继承
  updateConfig({ aux_llm: { temperature: 0.3, max_tokens: 128, sampling: { top_k: 30 } } });
  const aux = __testables.buildLLMConfig({ configScope: 'aux' });
  assert.equal(aux.temperature, 0.3);
  assert.equal(aux.max_tokens, 128);
  // 设置的键（top_k: 30）覆盖主模型，未设置的键继承主模型（updateConfig 后主模型采样被规整为全 6 键）
  assert.deepEqual(aux.sampling, {
    top_p: 0.9, top_k: 30, min_p: null, repetition_penalty: null, presence_penalty: null, frequency_penalty: null,
  });
  const writingAux = __testables.buildLLMConfig({ configScope: 'writing-aux' });
  assert.equal(writingAux.temperature, 0.3);
  assert.equal(writingAux.max_tokens, 128);
  assert.deepEqual(writingAux.sampling, {
    top_p: 0.9, top_k: 30, min_p: null, repetition_penalty: null, presence_penalty: null, frequency_penalty: null,
  });
  // 主模型 scope 不变
  const main = __testables.buildLLMConfig({});
  assert.equal(main.temperature, 0.6);
  assert.equal(main.max_tokens, 256);
  assert.equal(main.sampling.top_p, 0.9);

  updateConfig({ writing: { llm: { provider: 'mock', model: 'w', sampling: { top_p: 0.5 } } } });
  assert.equal(__testables.buildLLMConfig({ configScope: 'writing' }).sampling.top_p, 0.5);
});
