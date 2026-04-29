import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = process.env.WE_CONFIG_PATH
  || (process.env.WE_DATA_DIR
    ? path.resolve(process.env.WE_DATA_DIR, 'config.json')
    : path.resolve(__dirname, '..', '..', 'data', 'config.json'));

const DEFAULT_AUX_LLM = {
  provider: null,
  provider_keys: {},
  provider_models: {},
  base_url: null,
  model: null,
};

const DEFAULT_ASSISTANT = {
  model_source: 'main',
};

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
    auto_collapse_thinking: true,
  },
  context_history_rounds: 10,
  global_system_prompt: '',
  global_post_prompt: '',
  memory_expansion_enabled: true,
  suggestion_enabled: false,
  log_prompt: false,
  logging: {
    mode: 'metadata',
    max_preview_chars: 600,
    modules: {},
    prompt: {
      enabled: false,
    },
    llm_raw: {
      enabled:false,
    },
  },
  writing: {
    global_system_prompt: '',
    global_post_prompt: '',
    context_history_rounds: null,
    suggestion_enabled: false,
    memory_expansion_enabled: true,
    llm: {
      provider: null,
      provider_keys: {},
      provider_models: {},
      base_url: null,
      model: '',
      temperature: null,
      max_tokens: null,
    },
    aux_llm: structuredClone(DEFAULT_AUX_LLM),
  },
  diary: {
    chat: { enabled: false, date_mode: 'virtual' },
    writing: { enabled: false, date_mode: 'virtual' },
  },
  aux_llm: structuredClone(DEFAULT_AUX_LLM),
  assistant: structuredClone(DEFAULT_ASSISTANT),
};

const DEFAULT_WRITING = {
  global_system_prompt: '',
  global_post_prompt: '',
  context_history_rounds: null,
  suggestion_enabled: false,
  memory_expansion_enabled: true,
  llm: {
    provider: null,
    provider_keys: {},
    provider_models: {},
    base_url: null,
    model: '',
    temperature: null,
    max_tokens: null,
  },
  aux_llm: structuredClone(DEFAULT_AUX_LLM),
};

const DEFAULT_DIARY = {
  chat: { enabled: false, date_mode: 'virtual' },
  writing: { enabled: false, date_mode: 'virtual' },
};

const DEFAULT_LOGGING = {
  mode: 'metadata',
  max_preview_chars: 600,
  modules: {},
  prompt: {
    enabled: false,
  },
  llm_raw: {
    enabled: false,
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

  if (!config.logging || typeof config.logging !== 'object' || Array.isArray(config.logging)) {
    config.logging = structuredClone(DEFAULT_LOGGING);
    dirty = true;
  } else {
    const prevPromptEnabled = !!config.logging.prompt?.enabled;
    const prevLlmRawEnabled = !!config.logging.llm_raw?.enabled;
    config.logging = {
      ...structuredClone(DEFAULT_LOGGING),
      ...config.logging,
      modules: config.logging.modules && typeof config.logging.modules === 'object' && !Array.isArray(config.logging.modules)
        ? { ...config.logging.modules }
        : {},
      prompt: {
        ...DEFAULT_LOGGING.prompt,
        ...(config.logging.prompt && typeof config.logging.prompt === 'object' ? config.logging.prompt : {}),
      },
      llm_raw: {
        ...DEFAULT_LOGGING.llm_raw,
        ...(config.logging.llm_raw && typeof config.logging.llm_raw === 'object' ? config.logging.llm_raw : {}),
      },
    };
    if (config.logging.prompt.enabled !== prevPromptEnabled || config.logging.llm_raw.enabled !== prevLlmRawEnabled) {
      dirty = true;
    }
  }

  if (config.log_prompt === true && !config.logging.prompt.enabled) {
    config.logging.prompt.enabled = true;
    dirty = true;
  }

  if (config.logging.mode !== 'metadata' && config.logging.mode !== 'raw') {
    config.logging.mode = DEFAULT_LOGGING.mode;
    dirty = true;
  }

  const previewChars = Number(config.logging.max_preview_chars);
  if (!Number.isFinite(previewChars) || previewChars < 120) {
    config.logging.max_preview_chars = DEFAULT_LOGGING.max_preview_chars;
    dirty = true;
  } else if (previewChars !== config.logging.max_preview_chars) {
    config.logging.max_preview_chars = Math.floor(previewChars);
    dirty = true;
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
    if (!config.writing.llm.provider_keys || typeof config.writing.llm.provider_keys !== 'object') {
      config.writing.llm.provider_keys = {};
    }
    if (!config.writing.llm.provider_models || typeof config.writing.llm.provider_models !== 'object') {
      config.writing.llm.provider_models = {};
    }
    if (!config.writing.aux_llm || typeof config.writing.aux_llm !== 'object') {
      config.writing.aux_llm = structuredClone(DEFAULT_WRITING.aux_llm);
    }
    if (!config.writing.aux_llm.provider_keys || typeof config.writing.aux_llm.provider_keys !== 'object') {
      config.writing.aux_llm.provider_keys = {};
    }
    if (!config.writing.aux_llm.provider_models || typeof config.writing.aux_llm.provider_models !== 'object') {
      config.writing.aux_llm.provider_models = {};
    }
    config.writing = {
      ...DEFAULT_WRITING,
      ...config.writing,
      llm: {
        ...DEFAULT_WRITING.llm,
        ...config.writing.llm,
        provider_keys: { ...config.writing.llm.provider_keys },
        provider_models: { ...config.writing.llm.provider_models },
      },
      aux_llm: {
        ...DEFAULT_WRITING.aux_llm,
        ...config.writing.aux_llm,
        provider_keys: { ...config.writing.aux_llm.provider_keys },
        provider_models: { ...config.writing.aux_llm.provider_models },
      },
    };
  }

  // 补全 diary 命名空间（旧配置文件无此字段）
  if (!config.diary || typeof config.diary !== 'object') {
    config.diary = structuredClone(DEFAULT_DIARY);
  } else {
    config.diary = {
      chat: { ...DEFAULT_DIARY.chat, ...(config.diary.chat || {}) },
      writing: { ...DEFAULT_DIARY.writing, ...(config.diary.writing || {}) },
    };
  }

  // 补全 aux_llm 命名空间（新增字段）
  if (!config.aux_llm || typeof config.aux_llm !== 'object') {
    config.aux_llm = structuredClone(DEFAULT_AUX_LLM);
  } else {
    if (!config.aux_llm.provider_keys || typeof config.aux_llm.provider_keys !== 'object') {
      config.aux_llm.provider_keys = {};
    }
    if (!config.aux_llm.provider_models || typeof config.aux_llm.provider_models !== 'object') {
      config.aux_llm.provider_models = {};
    }
    config.aux_llm = {
      ...DEFAULT_AUX_LLM,
      ...config.aux_llm,
      provider_keys: { ...config.aux_llm.provider_keys },
      provider_models: { ...config.aux_llm.provider_models },
    };
  }

  // 补全 assistant 命名空间（新增字段）
  if (!config.assistant || typeof config.assistant !== 'object') {
    config.assistant = structuredClone(DEFAULT_ASSISTANT);
  } else {
    config.assistant = { ...DEFAULT_ASSISTANT, ...config.assistant };
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

/**
 * 获取有效的副模型(aux_llm)配置
 * 若副模型未配置(provider=null)，则回退到主模型配置
 */
export function getAuxLlmConfig() {
  const config = getConfig();
  const auxLlm = config.aux_llm;

  // 副模型未配置，回退主模型
  if (!auxLlm.provider) {
    return {
      provider: config.llm.provider,
      api_key: config.llm.provider_keys?.[config.llm.provider] || '',
      base_url: config.llm.base_url,
      model: config.llm.model,
    };
  }

  // 副模型已配置
  return {
    provider: auxLlm.provider,
    api_key: auxLlm.provider_keys?.[auxLlm.provider] || '',
    base_url: auxLlm.base_url,
    model: auxLlm.model,
  };
}

/**
 * 更新副模型的 API Key
 */
export function updateAuxApiKey(provider, key) {
  const current = getConfig();
  if (!current.aux_llm) {
    current.aux_llm = structuredClone(DEFAULT_AUX_LLM);
  }
  if (!current.aux_llm.provider_keys) {
    current.aux_llm.provider_keys = {};
  }
  current.aux_llm.provider_keys[provider] = key;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2), 'utf-8');
  return current;
}

/**
 * 获取有效的写作主模型(writing.llm)配置
 * 若写作主模型未配置(provider=null)，则回退到对话主模型配置
 */
export function getWritingLlmConfig() {
  const config = getConfig();
  const writingLlm = config.writing?.llm ?? {};

  if (!writingLlm.provider) {
    return {
      provider: config.llm.provider,
      api_key: config.llm.provider_keys?.[config.llm.provider] || '',
      base_url: config.llm.base_url,
      model: config.llm.model,
    };
  }

  return {
    provider: writingLlm.provider,
    api_key: writingLlm.provider_keys?.[writingLlm.provider] || '',
    base_url: writingLlm.base_url,
    model: writingLlm.model,
  };
}

/**
 * 更新写作主模型的 API Key
 */
export function updateWritingApiKey(provider, key) {
  const current = getConfig();
  if (!current.writing) current.writing = structuredClone(DEFAULT_WRITING);
  if (!current.writing.llm) current.writing.llm = structuredClone(DEFAULT_WRITING.llm);
  if (!current.writing.llm.provider_keys) current.writing.llm.provider_keys = {};
  current.writing.llm.provider_keys[provider] = key;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2), 'utf-8');
  return current;
}

/**
 * 获取有效的写作副模型(writing.aux_llm)配置
 * 回退链：writing.aux_llm → aux_llm → 对话主模型(llm)
 */
export function getWritingAuxLlmConfig() {
  const config = getConfig();
  const writingAux = config.writing?.aux_llm ?? {};

  if (writingAux.provider) {
    return {
      provider: writingAux.provider,
      api_key: writingAux.provider_keys?.[writingAux.provider] || '',
      base_url: writingAux.base_url,
      model: writingAux.model,
    };
  }

  // 回退到对话副模型（getAuxLlmConfig 内部再次回退到对话主模型）
  return getAuxLlmConfig();
}

/**
 * 更新写作副模型的 API Key
 */
export function updateWritingAuxApiKey(provider, key) {
  const current = getConfig();
  if (!current.writing) current.writing = structuredClone(DEFAULT_WRITING);
  if (!current.writing.aux_llm) current.writing.aux_llm = structuredClone(DEFAULT_AUX_LLM);
  if (!current.writing.aux_llm.provider_keys) current.writing.aux_llm.provider_keys = {};
  current.writing.aux_llm.provider_keys[provider] = key;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(current, null, 2), 'utf-8');
  return current;
}
