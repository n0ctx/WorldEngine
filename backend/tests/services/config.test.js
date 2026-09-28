import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';

const sandbox = createTestSandbox('config-service');
sandbox.setEnv();
const { getConfig, updateConfig } = await freshImport('backend/services/config.js');

after(() => sandbox.cleanup());

test('缺少配置文件时写入默认值并返回独立对象', () => {
  fs.rmSync(sandbox.configPath, { force: true });

  const config = getConfig();
  assert.equal(config.ui.theme, 'nocturne');
  assert.deepEqual(config.danmaku, { enabled: false, count: 5, speed: 'normal' });
  assert.equal(config.short_term_token_budget, 8000);
  assert.equal(config.long_term_index_budget, 20000);
  assert.equal(config.writing.short_term_token_budget, null);
  assert.deepEqual(sandbox.readConfig(), config);

  config.ui.theme = 'changed';
  assert.equal(getConfig().ui.theme, 'nocturne');
});

test('updateConfig：非法预算值规范到默认值/null，合法值按范围钳制', () => {
  fs.rmSync(sandbox.configPath, { force: true });

  const config = updateConfig({
    short_term_token_budget: 'abc',
    long_term_index_budget: 1,
    state_injection_token_budget: 'abc',
    writing: { short_term_token_budget: 'abc' },
  });
  assert.equal(config.short_term_token_budget, 8000);
  assert.equal(config.long_term_index_budget, 2000);
  assert.equal(config.state_injection_token_budget, 3000);
  assert.equal(config.writing.short_term_token_budget, null);

  const clamped = updateConfig({
    short_term_token_budget: 999999,
    long_term_index_budget: 999999999,
    state_injection_token_budget: 999999,
    writing: { short_term_token_budget: 500 },
  });
  assert.equal(clamped.short_term_token_budget, 200000);
  assert.equal(clamped.long_term_index_budget, 500000);
  assert.equal(clamped.state_injection_token_budget, 50000);
  assert.equal(clamped.writing.short_term_token_budget, 1000);

  const lowClamped = updateConfig({ state_injection_token_budget: 1 });
  assert.equal(lowClamped.state_injection_token_budget, 500);

  const inherited = updateConfig({ writing: { short_term_token_budget: null } });
  assert.equal(inherited.writing.short_term_token_budget, null);
});

test('读取旧配置时迁移共享密钥并持久化规范化结果', () => {
  sandbox.writeConfig({
    provider_keys: { shared: 'root-key' },
    llm: { provider: 'llm', api_key: 'llm-key', provider_keys: { llm_legacy: 'llm-secret' } },
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

  assert.deepEqual(config.provider_keys, {
    shared: 'root-key',
    llm: 'llm-key',
    llm_legacy: 'llm-secret',
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

test('旧配置含七个废弃键时，迁移后全部消失并持久化', () => {
  sandbox.writeConfig({
    context_compress_rounds: 7,
    context_history_rounds: 10,
    long_term_memory_enabled: true,
    embedding: { provider: 'openai', model: 'text-embedding-3-small' },
    writing: {
      context_history_rounds: 5,
      long_term_memory_enabled: true,
      saved_nearby_recall_enabled: true,
    },
  });

  const config = getConfig();

  assert.equal('context_compress_rounds' in config, false);
  assert.equal('context_history_rounds' in config, false);
  assert.equal('long_term_memory_enabled' in config, false);
  assert.equal('embedding' in config, false);
  assert.equal('context_history_rounds' in config.writing, false);
  assert.equal('long_term_memory_enabled' in config.writing, false);
  assert.equal('saved_nearby_recall_enabled' in config.writing, false);
  assert.deepEqual(sandbox.readConfig(), config);
});

test('不含废弃键的配置在再次读取时不会被重写', () => {
  fs.rmSync(sandbox.configPath, { force: true });
  getConfig();
  const mtimeBefore = fs.statSync(sandbox.configPath).mtimeMs;

  getConfig();
  const mtimeAfter = fs.statSync(sandbox.configPath).mtimeMs;
  assert.equal(mtimeAfter, mtimeBefore);
});

test('openai_compatible 的 provider key：仍被使用时保留，无 scope 使用时删除', () => {
  sandbox.writeConfig({
    provider_keys: { openai_compatible: 'compat-key' },
    llm: { provider: 'openai_compatible', model: 'compat-model' },
  });
  const kept = getConfig();
  assert.equal(kept.provider_keys.openai_compatible, 'compat-key');

  sandbox.writeConfig({
    provider_keys: { openai_compatible: 'compat-key' },
    llm: { provider: 'mock', model: 'mock-model' },
  });
  const removed = getConfig();
  assert.equal('openai_compatible' in removed.provider_keys, false);
});
