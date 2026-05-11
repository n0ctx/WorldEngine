import test from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';

// 回归测试: completeWithTools 顶层入口的重试 catch 必须透传 ToolLoopCancelledError,
// 不可走 retry 循环 (与 resolveToolContext 对齐)。
test('completeWithTools: 工具抛 ToolLoopCancelledError 不进入重试循环', async (t) => {
  const sandbox = createTestSandbox('llm-complete-tools-cancel', {
    provider_keys: { mock: 'secret' },
    llm: {
      provider: 'mock',
      model: 'mock-model',
      temperature: 0.5,
      max_tokens: 128,
    },
  });
  t.after(() => {
    resetMockEnv();
    sandbox.cleanup();
    delete process.env.MOCK_LLM_TOOL_CALLS;
    delete process.env.WE_LLM_RETRY_MAX;
    delete process.env.WE_LLM_RETRY_DELAY_MS;
  });
  sandbox.setEnv();

  // mock provider 会按 MOCK_LLM_TOOL_CALLS 调用 handler
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([{ name: 'cancelTool', arguments: {} }]);
  // 把重试上限设大,以便观察:如果守卫缺失则会被多次调用
  process.env.WE_LLM_RETRY_MAX = '3';
  process.env.WE_LLM_RETRY_DELAY_MS = '1';

  const [{ completeWithTools }, { ToolLoopCancelledError }] = await Promise.all([
    freshImport('backend/llm/index.js'),
    freshImport('backend/llm/tool-loop-control.js'),
  ]);

  let handlerCalls = 0;
  const tools = [{
    type: 'function',
    function: {
      name: 'cancelTool',
      description: 't',
      parameters: { type: 'object', properties: {} },
    },
    execute: async () => {
      handlerCalls += 1;
      throw new ToolLoopCancelledError('mock cancel');
    },
  }];

  await assert.rejects(
    () => completeWithTools([{ role: 'user', content: 'x' }], tools, { configScope: 'main' }),
    (err) => err.name === 'ToolLoopCancelledError' && /mock cancel/.test(err.message),
  );
  // 守卫生效时只被调用一次(无重试);若 catch 漏守则会 ≥2 次
  assert.equal(handlerCalls, 1, `cancel 不应被重试,handlerCalls=${handlerCalls}`);
});
