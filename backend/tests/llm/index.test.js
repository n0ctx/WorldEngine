import test from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';

test('buildLLMConfig 使用调用方 options 覆盖配置文件', async (t) => {
  const sandbox = createTestSandbox('llm-config', {
    llm: {
      provider: 'mock',
      provider_keys: { mock: 'secret' },
      model: 'cfg-model',
      temperature: 0.8,
      max_tokens: 512,
    },
  });
  t.after(() => {
    resetMockEnv();
    sandbox.cleanup();
  });
  sandbox.setEnv();

  const { __testables } = await freshImport('backend/llm/index.js');
  const config = __testables.buildLLMConfig({
    model: 'override-model',
    temperature: 0.2,
    maxTokens: 128,
    conversationId: 'sess-abc',
  });

  assert.equal(config.provider, 'mock');
  assert.equal(config.api_key, 'secret');
  assert.equal(config.model, 'override-model');
  assert.equal(config.temperature, 0.2);
  assert.equal(config.max_tokens, 128);
  assert.equal(config.conversationId, 'sess-abc');

  const noId = __testables.buildLLMConfig({});
  assert.equal(noId.conversationId, undefined);
});


test('getProvider 能路由到 mock provider', async (t) => {
  const sandbox = createTestSandbox('llm-provider');
  t.after(() => sandbox.cleanup());
  sandbox.setEnv();

  const [{ __testables }, mockProvider] = await Promise.all([
    freshImport('backend/llm/index.js'),
    freshImport('backend/llm/providers/mock.js'),
  ]);

  assert.equal(typeof __testables.getProvider('mock').complete, 'function');
  assert.equal(typeof mockProvider.complete, 'function');
});

test('splitTools 只暴露定义并保留 execute handler', async (t) => {
  const sandbox = createTestSandbox('llm-tools');
  t.after(() => sandbox.cleanup());
  sandbox.setEnv();

  const { __testables } = await freshImport('backend/llm/index.js');
  const execute = async () => 'done';
  const { defs, handlers } = __testables.splitTools([
    {
      type: 'function',
      function: {
        name: 'save_note',
        description: 'save',
        parameters: { type: 'object', properties: {} },
      },
      execute,
    },
  ]);

  assert.equal(defs.length, 1);
  assert.equal(defs[0].execute, undefined);
  assert.equal(await handlers.save_note({}), 'done');
});
