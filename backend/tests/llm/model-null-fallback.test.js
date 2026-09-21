import test from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';

/**
 * 统一回合上下文（app/turn/build-turn-context.js）让 overrides.model 恒存在，
 * chat 模式恒为 null。这里钉住「model: null 等价于不传」，否则 chat 会被打到空模型。
 *
 * 独立成文件：services/config.js 的 CONFIG_PATH 在模块加载时固化，
 * 与其它用例同文件会读到已清理沙箱的路径。
 */
test('buildLLMConfig 把 model: null 视作未传，回落配置文件模型', { concurrency: false }, async (t) => {
  const sandbox = createTestSandbox('llm-config-null-model', {
    provider_keys: { mock: 'secret' },
    llm: { provider: 'mock', model: 'cfg-model', temperature: 0.8, max_tokens: 512 },
  });
  t.after(() => {
    resetMockEnv();
    sandbox.cleanup();
  });
  sandbox.setEnv();

  const { __testables } = await freshImport('backend/llm/index.js');
  const withNull = __testables.buildLLMConfig({ model: null });
  const withoutField = __testables.buildLLMConfig({});

  assert.equal(withNull.model, 'cfg-model');
  assert.equal(withNull.model, withoutField.model);
});
