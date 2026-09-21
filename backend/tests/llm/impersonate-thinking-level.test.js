import test from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import { chatMode } from '../../app/modes/chat-mode.js';
import { writingMode } from '../../app/modes/writing-mode.js';

/**
 * 代拟端点合并成一份实现后，thinking_level 的差异由 mode.impersonate.disableThinking 承载：
 * 对话侧一直显式关闭扩展思考，写作侧沿用 writing.llm.thinking_level 配置。
 * buildLLMConfig 用 hasOwnProperty 判断是否覆盖，所以「传 null」和「不传」必须区分开。
 *
 * 独立成文件：services/config.js 的 CONFIG_PATH 在模块加载时固化。
 */
test('代拟的 thinking_level：对话强制关闭，写作沿用配置', { concurrency: false }, async (t) => {
  const sandbox = createTestSandbox('llm-impersonate-thinking', {
    provider_keys: { mock: 'secret' },
    llm: { provider: 'mock', model: 'cfg-model', thinking_level: 'high' },
    writing: { llm: { provider: 'mock', model: 'w-model', thinking_level: 'thinking_enabled' } },
  });
  t.after(() => {
    resetMockEnv();
    sandbox.cleanup();
  });
  sandbox.setEnv();

  const { __testables } = await freshImport('backend/llm/index.js');
  const optionsFor = (mode) => ({
    configScope: mode.llm.configScope,
    ...(mode.impersonate.disableThinking ? { thinking_level: null } : {}),
  });

  assert.equal(chatMode.impersonate.disableThinking, true);
  assert.equal(writingMode.impersonate.disableThinking, false);
  assert.equal(__testables.buildLLMConfig(optionsFor(chatMode)).thinking_level, null);
  assert.equal(__testables.buildLLMConfig(optionsFor(writingMode)).thinking_level, 'thinking_enabled');
});
