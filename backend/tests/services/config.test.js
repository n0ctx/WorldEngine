import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';

const sandbox = createTestSandbox('config-service');
sandbox.setEnv();
const { getConfig } = await freshImport('backend/services/config.js');

after(() => sandbox.cleanup());

test('缺少配置文件时写入默认值并返回独立对象', () => {
  fs.rmSync(sandbox.configPath, { force: true });

  const config = getConfig();
  assert.equal(config.ui.theme, 'nocturne');
  assert.deepEqual(config.danmaku, { enabled: false, count: 5, speed: 'normal' });
  assert.deepEqual(sandbox.readConfig(), config);

  config.ui.theme = 'changed';
  assert.equal(getConfig().ui.theme, 'nocturne');
});

test('读取旧配置时迁移共享密钥并持久化规范化结果', () => {
  sandbox.writeConfig({
    context_compress_rounds: 7,
    provider_keys: { shared: 'root-key' },
    llm: { provider: 'llm', api_key: 'llm-key', provider_keys: { llm_legacy: 'llm-secret' } },
    embedding: { provider: 'embedding', provider_keys: { shared: 'old-key', embedding_legacy: 'embedding-secret' } },
    aux_llm: { provider: 'aux', api_key: 'aux-key' },
    log_prompt: true,
    logging: { mode: 'raw', max_preview_chars: '120.8', modules: [], llm_raw: { enabled: true } },
    ui: { theme: 'dark', font_size: 18 },
    writing: {
      llm: { provider: 'writer', api_key: 'writer-key', provider_models: { writer: 'writer-model' } },
      aux_llm: { provider: 'writer_aux', provider_keys: { writer_aux: 'writer-aux-key' } },
    },
    diary: { chat: { enabled: true } },
    assistant: { model_source: 'writing' },
    danmaku: false,
    table_memory_row_limits: { relations: 6, items: '3.8', unknown: 99 },
  });

  const config = getConfig();

  assert.equal(config.context_history_rounds, 7);
  assert.equal('context_compress_rounds' in config, false);
  assert.deepEqual(config.provider_keys, {
    shared: 'root-key',
    llm: 'llm-key',
    llm_legacy: 'llm-secret',
    embedding_legacy: 'embedding-secret',
    aux: 'aux-key',
    writer: 'writer-key',
    writer_aux: 'writer-aux-key',
  });
  assert.equal(config.llm.api_key, undefined);
  assert.equal(config.llm.provider_keys, undefined);
  assert.deepEqual(config.logging.modules, {});
  assert.equal(config.logging.mode, 'raw');
  assert.equal(config.logging.max_preview_chars, 120);
  assert.equal(config.logging.prompt.enabled, true);
  assert.equal(config.logging.llm_raw.enabled, true);
  assert.deepEqual(config.ui, {
    theme: 'nocturne',
    font_size: 18,
    custom_css: '',
    show_thinking: true,
    auto_collapse_thinking: true,
    show_token_usage: false,
  });
  assert.equal(config.writing.llm.model, '');
  assert.deepEqual(config.writing.llm.provider_models, { writer: 'writer-model' });
  assert.deepEqual(config.diary, {
    chat: { enabled: true, date_mode: 'virtual' },
    writing: { enabled: false, date_mode: 'virtual' },
  });
  assert.deepEqual(config.danmaku, { enabled: false, count: 5, speed: 'normal' });
  assert.deepEqual(config.table_memory_row_limits, {
    relations: 6,
    items: 3,
    places: 30,
    factions: 20,
  });
  assert.deepEqual(sandbox.readConfig(), config);
});
