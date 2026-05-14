import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';

test('buildLLMConfig 使用调用方 options 覆盖配置文件', async (t) => {
  const sandbox = createTestSandbox('llm-config', {
    provider_keys: { mock: 'secret' },
    llm: {
      provider: 'mock',
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
    freshImport('backend/llm/providers/mock/index.js'),
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

test('complete 在 provider 非流式调用超时时返回 504 LLMError', async (t) => {
  const sandbox = createTestSandbox('llm-complete-timeout', {
    provider_keys: { mock: 'secret' },
    llm: {
      provider: 'mock',
      model: 'mock-model',
    },
  });
  t.after(() => {
    resetMockEnv();
    sandbox.cleanup();
  });
  const output = execFileSync(process.execPath, [
    '--input-type=module',
    '-e',
    `
      try {
        const { complete } = await import('./backend/llm/index.js');
        await complete([{ role: 'user', content: 'hello' }], { timeoutMs: 10, callType: 'timeout_test' });
        console.log(JSON.stringify({ ok: true }));
      } catch (err) {
        console.log(JSON.stringify({
          ok: false,
          name: err?.name,
          status: err?.status,
          message: err?.message,
        }));
      }
    `,
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      WE_DB_PATH: sandbox.dbPath,
      WE_CONFIG_PATH: sandbox.configPath,
      WE_DATA_DIR: sandbox.root,
      WE_UPLOADS_DIR: sandbox.uploadsDir,
      WE_TURN_SUMMARY_STORE_PATH: sandbox.turnSummaryStorePath,
      ASSISTANT_STATE_DIR: sandbox.assistantStateDir,
      WE_DISABLE_AUTOSTART: 'true',
      WE_LLM_RETRY_MAX: '0',
      WE_LLM_RETRY_DELAY_MS: '0',
      LOG_FILE: 'false',
      MOCK_LLM_COMPLETE_DELAY_MS: '100',
    },
    encoding: 'utf-8',
  });

  const parsed = JSON.parse(output.trim());
  assert.equal(parsed.ok, false);
  assert.equal(parsed.name, 'LLMError');
  assert.equal(parsed.status, 504);
  assert.match(parsed.message, /timed out/);
});
