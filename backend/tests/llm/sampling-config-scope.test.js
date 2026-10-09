import test from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';

// 独立成文件：services/config.js 的 CONFIG_PATH 在模块加载时固化，与其它用例同文件会读到已清理沙箱的路径。
test('buildLLMConfig：采样参数只给对话 / 写作主模型，写作选了独立服务商时用自己的设置', { concurrency: false }, async (t) => {
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
  assert.equal(__testables.buildLLMConfig({ configScope: 'aux' }).sampling, undefined);
  assert.equal(__testables.buildLLMConfig({ configScope: 'writing-aux' }).sampling, undefined);
  assert.equal(__testables.buildLLMConfig({ configScope: 'writing' }).sampling.top_p, 0.9);

  updateConfig({ writing: { llm: { provider: 'mock', model: 'w', sampling: { top_p: 0.5 } } } });
  assert.equal(__testables.buildLLMConfig({ configScope: 'writing' }).sampling.top_p, 0.5);
});
