import test, { after, mock } from 'node:test';
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

test('动效包默认墨流；保存与读取时未知的动效包都回落默认', () => {
  fs.rmSync(sandbox.configPath, { force: true });
  assert.equal(getConfig().ui.motion, 'liquid');

  assert.equal(updateConfig({ ui: { motion: 'signal' } }).ui.motion, 'signal');
  assert.equal(getConfig().ui.motion, 'signal');
  assert.equal(updateConfig({ ui: { motion: 'dice' } }).ui.motion, 'dice');

  assert.equal(updateConfig({ ui: { motion: 'no-such-pack' } }).ui.motion, 'liquid');

  sandbox.writeConfig({ ui: { theme: 'nocturne', motion: 42 } });
  assert.equal(getConfig().ui.motion, 'liquid');
  assert.equal(sandbox.readConfig().ui.motion, 'liquid');
});

test('思考档位：保存与读取时，当前服务商不支持的档位都回到自动', () => {
  fs.rmSync(sandbox.configPath, { force: true });
  updateConfig({ llm: { provider: 'kimi-coding', thinking_level: 'effort_max' } });
  assert.equal(getConfig().llm.thinking_level, 'effort_max');

  const switched = updateConfig({ llm: { provider: 'grok' } });
  assert.equal(switched.llm.thinking_level, null);
  assert.equal(updateConfig({ llm: { thinking_level: 'effort_xhigh' } }).llm.thinking_level, 'effort_xhigh');

  sandbox.writeConfig({
    llm: { provider: 'xiaomi', model: 'mimo', thinking_level: 'effort_high' },
    aux_llm: { provider: 'anthropic', model: 'claude', thinking_level: 'budget_low' },
    writing: { llm: { provider: null, thinking_level: 'none' } },
  });
  const config = getConfig();
  assert.equal(config.llm.thinking_level, null);
  assert.equal(config.aux_llm.thinking_level, 'budget_low');
  assert.equal(config.writing.llm.thinking_level, null);
  assert.equal(sandbox.readConfig().llm.thinking_level, null);
});

test('对话和写作的行为配置分别保存', () => {
  fs.rmSync(sandbox.configPath, { force: true });
  updateConfig({
    long_term_index_budget: 6000,
    danmaku: { enabled: true, count: 4, speed: 'slow' },
    ui: { show_thinking: false },
    writing: {
      long_term_index_budget: 30000,
      danmaku: { enabled: false, count: 9, speed: 'fast' },
      ui: { show_thinking: true },
    },
  });
  const config = getConfig();
  assert.equal(config.long_term_index_budget, 6000);
  assert.equal(config.writing.long_term_index_budget, 30000);
  assert.equal(config.danmaku.count, 4);
  assert.equal(config.writing.danmaku.count, 9);
  assert.equal(config.ui.show_thinking, false);
  assert.equal(config.writing.ui.show_thinking, true);
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

test('采样参数：对话与写作主模型保存时规整取值，副模型不带这一组', () => {
  fs.rmSync(sandbox.configPath, { force: true });
  assert.equal(getConfig().llm.sampling.top_p, null);

  const config = updateConfig({
    llm: { sampling: { top_p: 1.5, top_k: '40.4', min_p: 'abc', unknown: 1 } },
    writing: { llm: { sampling: { repetition_penalty: 1.1 } } },
  });
  assert.deepEqual(config.llm.sampling, {
    top_p: 1, top_k: 40, min_p: null, repetition_penalty: null, presence_penalty: null, frequency_penalty: null,
  });
  assert.equal(config.writing.llm.sampling.repetition_penalty, 1.1);
  assert.equal('sampling' in config.aux_llm, false);

  const cleared = updateConfig({ llm: { sampling: { top_p: null } } });
  assert.equal(cleared.llm.sampling.top_p, null);
  assert.equal(cleared.llm.sampling.top_k, 40);
});

test('写作还没有自己的显示设置时继承顶层的思考 / token 消耗开关', () => {
  sandbox.writeConfig({
    ui: { theme: 'dark', show_token_usage: true, show_thinking: false },
    writing: { llm: { provider: 'writer' } },
  });

  const config = getConfig();
  assert.deepEqual(config.writing.ui, { show_thinking: false, auto_collapse_thinking: true, show_token_usage: true });
  assert.deepEqual(sandbox.readConfig().writing.ui, config.writing.ui);

  sandbox.writeConfig({ ui: { show_token_usage: true }, writing: { ui: { show_token_usage: false } } });
  assert.equal(getConfig().writing.ui.show_token_usage, false, '写作已有自己的设置时不覆盖');
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
    motion: 'liquid',
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
  assert.equal('table_memory_row_limits' in config, false);
  assert.deepEqual(sandbox.readConfig(), config);
});

test('旧配置含废弃键时，迁移后全部消失并持久化', () => {
  sandbox.writeConfig({
    memory_recall_max_sessions: 2,
    context_compress_rounds: 7,
    context_history_rounds: 10,
    long_term_memory_enabled: true,
    embedding: { provider: 'openai', model: 'text-embedding-3-small' },
    table_memory_enabled: true,
    table_memory_row_limits: { relations: 6 },
    writing: {
      memory_recall_max_sessions: 8,
      context_history_rounds: 5,
      long_term_memory_enabled: true,
      saved_nearby_recall_enabled: true,
      table_memory_enabled: true,
      table_memory_row_limits: { relations: 6 },
    },
  });

  const config = getConfig();

  assert.equal('memory_recall_max_sessions' in config, false);
  assert.equal('memory_recall_max_sessions' in config.writing, false);
  assert.equal('context_compress_rounds' in config, false);
  assert.equal('context_history_rounds' in config, false);
  assert.equal('long_term_memory_enabled' in config, false);
  assert.equal('embedding' in config, false);
  assert.equal('table_memory_enabled' in config, false);
  assert.equal('table_memory_row_limits' in config, false);
  assert.equal('context_history_rounds' in config.writing, false);
  assert.equal('long_term_memory_enabled' in config.writing, false);
  assert.equal('saved_nearby_recall_enabled' in config.writing, false);
  assert.equal('table_memory_enabled' in config.writing, false);
  assert.equal('table_memory_row_limits' in config.writing, false);
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

test('配置文件未变时直接复用已解析的配置，文件被外部改动后重新读取', () => {
  fs.rmSync(sandbox.configPath, { force: true });
  updateConfig({ ui: { theme: 'phosphor' } });
  const externallyEdited = { ...sandbox.readConfig(), ui: { theme: 'nocturne' } };

  const readFileSync = mock.method(fs, 'readFileSync');
  try {
    getConfig();
    getConfig();
    assert.equal(getConfig().ui.theme, 'phosphor');
    assert.equal(readFileSync.mock.callCount(), 0);

    sandbox.writeConfig(externallyEdited);
    assert.equal(getConfig().ui.theme, 'nocturne');
    assert.equal(readFileSync.mock.calls.filter((call) => call.arguments[0] === sandbox.configPath).length, 1);
  } finally {
    readFileSync.mock.restore();
  }
});
