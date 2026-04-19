import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '..', '..', 'data', 'config.json');

const DEFAULT_CONFIG = {
  version: 1,
  proxy_url: '',
  llm: {
    provider: 'openai',
    provider_keys: {},
    provider_models: {},
    base_url: '',
    model: '',
    max_tokens: 4096,
    temperature: 0.8,
    thinking_level: null,
  },
  embedding: {
    provider: 'openai',
    provider_keys: {},
    provider_models: {},
    base_url: '',
    model: 'text-embedding-3-small',
  },
  ui: {
    theme: 'dark',
    font_size: 16,
    custom_css: '',
    show_thinking: true,
  },
  context_history_rounds: 10,
  global_system_prompt: '',
  global_post_prompt: '',
  memory_expansion_enabled: true,
  writing: {
    global_system_prompt: '',
    global_post_prompt: '',
    context_history_rounds: null,
    llm: {
      model: '',
      temperature: null,
      max_tokens: null,
    },
  },
};

const DEFAULT_WRITING = {
  global_system_prompt: '',
  global_post_prompt: '',
  context_history_rounds: null,
  llm: {
    model: '',
    temperature: null,
    max_tokens: null,
  },
};

/**
 * 深度合并 source 到 target，只覆盖已有字段层级
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * 读取当前配置，不存在则初始化默认配置并写入文件
 */
export function getConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    return structuredClone(DEFAULT_CONFIG);
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const config = JSON.parse(raw);

  let dirty = false;

  // 迁移旧字段名 context_compress_rounds → context_history_rounds
  if ('context_compress_rounds' in config && !('context_history_rounds' in config)) {
    config.context_history_rounds = config.context_compress_rounds;
    delete config.context_compress_rounds;
    dirty = true;
  }

  // 迁移旧 api_key → provider_keys，然后删除 api_key
  for (const section of ['llm', 'embedding']) {
    if (!config[section] || typeof config[section] !== 'object') continue;
    if (!config[section].provider_keys || typeof config[section].provider_keys !== 'object') {
      config[section].provider_keys = {};
      dirty = true;
    }
    const { provider, api_key, provider_keys } = config[section];
    if (api_key) {
      // 若当前 provider 还没有 key，把旧 api_key 迁入
      if (provider && !provider_keys[provider]) {
        config[section].provider_keys[provider] = api_key;
      }
      delete config[section].api_key;
      dirty = true;
    }
  }

  if (dirty) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  }

  // 补全 writing 命名空间（旧配置文件无此字段）
  if (!config.writing || typeof config.writing !== 'object') {
    config.writing = structuredClone(DEFAULT_WRITING);
  } else {
    if (!config.writing.llm || typeof config.writing.llm !== 'object') {
      config.writing.llm = structuredClone(DEFAULT_WRITING.llm);
    }
    config.writing = { ...DEFAULT_WRITING, ...config.writing, llm: { ...DEFAULT_WRITING.llm, ...config.writing.llm } };
  }

  return config;
}

/**
 * 部分更新配置（深度合并），返回更新后的完整配置
 */
export function updateConfig(patch) {
  const current = getConfig();
  const merged = deepMerge(current, patch);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}
