import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger, formatMeta } from '../utils/logger.js';

const log = createLogger('svc', 'green');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = process.env.WE_CONFIG_PATH
  || (process.env.WE_DATA_DIR
    ? path.resolve(process.env.WE_DATA_DIR, 'config.json')
    : path.resolve(__dirname, '..', '..', 'data', 'config.json'));

const DEFAULT_AUX_LLM = {
  provider: null,
  provider_models: {},
  base_url: null,
  model: null,
  thinking_level: null,
};

const DEFAULT_ASSISTANT = {
  model_source: 'main',
};

const DEFAULT_UI = {
  theme: 'classic-parchment',
  font_size: 16,
  custom_css: '',
  show_thinking: true,
  auto_collapse_thinking: true,
  show_token_usage: false,
};

const DEFAULT_CONFIG = {
  version: 1,
  proxy_url: '',
  // 顶层共享 API Key 池：{ providerName: api_key }，所有 LLM/Embedding section 共用
  provider_keys: {},
  llm: {
    provider: 'openai',
    provider_models: {},
    base_url: '',
    model: '',
    max_tokens: 4096,
    temperature: 0.8,
    thinking_level: null,
  },
  embedding: {
    provider: 'openai',
    provider_models: {},
    base_url: '',
    model: 'text-embedding-3-small',
  },
  ui: structuredClone(DEFAULT_UI),
  context_history_rounds: 10,
  chapter_turn_size: 20,
  page_turn_size: 50,
  global_system_prompt: '',
  global_post_prompt: '',
  memory_expansion_enabled: true,
  long_term_memory_enabled: false,
  memory_recall_max_sessions: 5,
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
      enabled: false,
    },
  },
  writing: {
    global_system_prompt: '',
    global_post_prompt: '',
    context_history_rounds: null,
    chapter_turn_size: null,
    page_turn_size: null,
    suggestion_enabled: false,
    memory_expansion_enabled: true,
    long_term_memory_enabled: false,
    saved_nearby_recall_enabled: true,
    llm: {
      provider: null,
      provider_models: {},
      base_url: null,
      model: '',
      temperature: null,
      max_tokens: null,
      thinking_level: null,
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
  chapter_turn_size: null,
  page_turn_size: null,
  suggestion_enabled: false,
  memory_expansion_enabled: true,
  long_term_memory_enabled: false,
  saved_nearby_recall_enabled: true,
  llm: {
    provider: null,
    provider_models: {},
    base_url: null,
    model: '',
    temperature: null,
    max_tokens: null,
    thinking_level: null,
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

function writeConfigFile(config) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  const tmpPath = `${CONFIG_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf-8');
  fs.renameSync(tmpPath, CONFIG_PATH);
}

function ensurePlainObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function normalizePositiveInteger(value, fallback, { min = 1, max = 100000 } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function normalizeTemperature(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(2, Math.max(0, number));
}

function normalizeLlmSection(section, defaults) {
  const src = ensurePlainObject(section);
  return {
    ...defaults,
    ...src,
    provider: src.provider == null ? defaults.provider : String(src.provider),
    provider_models: ensurePlainObject(src.provider_models),
    base_url: src.base_url == null ? defaults.base_url : String(src.base_url),
    model: src.model == null ? defaults.model : String(src.model),
    ...(Object.hasOwn(defaults, 'max_tokens')
      ? { max_tokens: normalizePositiveInteger(src.max_tokens, defaults.max_tokens, { min: 1, max: 200000 }) }
      : {}),
    ...(Object.hasOwn(defaults, 'temperature')
      ? { temperature: normalizeTemperature(src.temperature, defaults.temperature) }
      : {}),
  };
}

function normalizeConfigForPersist(config) {
  const normalized = ensurePlainObject(config, structuredClone(DEFAULT_CONFIG));
  normalized.provider_keys = ensurePlainObject(normalized.provider_keys);
  normalized.llm = normalizeLlmSection(normalized.llm, DEFAULT_CONFIG.llm);
  normalized.embedding = normalizeLlmSection(normalized.embedding, DEFAULT_CONFIG.embedding);
  normalized.aux_llm = normalizeLlmSection(normalized.aux_llm, DEFAULT_AUX_LLM);
  normalized.writing = ensurePlainObject(normalized.writing, structuredClone(DEFAULT_WRITING));
  normalized.writing.llm = normalizeLlmSection(normalized.writing.llm, DEFAULT_WRITING.llm);
  normalized.writing.aux_llm = normalizeLlmSection(normalized.writing.aux_llm, DEFAULT_WRITING.aux_llm);
  normalized.ui = { ...structuredClone(DEFAULT_UI), ...ensurePlainObject(normalized.ui) };
  normalized.logging = { ...structuredClone(DEFAULT_LOGGING), ...ensurePlainObject(normalized.logging) };
  normalized.context_history_rounds = normalizePositiveInteger(
    normalized.context_history_rounds,
    DEFAULT_CONFIG.context_history_rounds,
    { min: 1, max: 1000 },
  );
  normalized.chapter_turn_size = normalizePositiveInteger(
    normalized.chapter_turn_size,
    DEFAULT_CONFIG.chapter_turn_size,
    { min: 1, max: 1000 },
  );
  normalized.page_turn_size = normalizePositiveInteger(
    normalized.page_turn_size,
    DEFAULT_CONFIG.page_turn_size,
    { min: 1, max: 10000 },
  );
  return normalized;
}

/**
 * 把指定 section 残留的 provider_keys 合并到顶层共享池，然后删除 section 内副本。
 * 优先保留已存在的顶层值（不覆盖）。返回 true 表示发生了变更。
 */
function mergeSectionKeys(section, sharedKeys) {
  if (!section || typeof section !== 'object') return false;
  let dirty = false;
  if ('api_key' in section) {
    if (section.api_key && section.provider && !sharedKeys[section.provider]) {
      sharedKeys[section.provider] = section.api_key;
    }
    delete section.api_key;
    dirty = true;
  }
  if (section.provider_keys && typeof section.provider_keys === 'object') {
    for (const [provider, key] of Object.entries(section.provider_keys)) {
      if (key && !sharedKeys[provider]) {
        sharedKeys[provider] = key;
      }
    }
    delete section.provider_keys;
    dirty = true;
  }
  return dirty;
}

/**
 * 读取当前配置，不存在则初始化默认配置并写入文件
 */
export function getConfig() {
 if (!fs.existsSync(CONFIG_PATH)) {
 writeConfigFile(DEFAULT_CONFIG);
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

  // 顶层共享 provider_keys 迁移：把 5 套独立 provider_keys 合并到顶层
  if (!config.provider_keys || typeof config.provider_keys !== 'object' || Array.isArray(config.provider_keys)) {
    config.provider_keys = {};
    dirty = true;
  }
  for (const section of [config.llm, config.embedding, config.aux_llm, config.writing?.llm, config.writing?.aux_llm]) {
    if (mergeSectionKeys(section, config.provider_keys)) dirty = true;
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
    writeConfigFile(config);
  }

  if (!config.ui || typeof config.ui !== 'object') {
    config.ui = structuredClone(DEFAULT_UI);
    dirty = true;
  } else {
    config.ui = { ...DEFAULT_UI, ...config.ui };
    if (config.ui.theme === 'dark' || config.ui.theme === 'parchment') {
      config.ui.theme = DEFAULT_UI.theme;
      dirty = true;
    }
  }

  // 补全 writing 命名空间（旧配置文件无此字段）
  if (!config.writing || typeof config.writing !== 'object') {
    config.writing = structuredClone(DEFAULT_WRITING);
  } else {
    if (!config.writing.llm || typeof config.writing.llm !== 'object') {
      config.writing.llm = structuredClone(DEFAULT_WRITING.llm);
    }
    if (!config.writing.llm.provider_models || typeof config.writing.llm.provider_models !== 'object') {
      config.writing.llm.provider_models = {};
    }
    if (!config.writing.aux_llm || typeof config.writing.aux_llm !== 'object') {
      config.writing.aux_llm = structuredClone(DEFAULT_WRITING.aux_llm);
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
        provider_models: { ...config.writing.llm.provider_models },
      },
      aux_llm: {
        ...DEFAULT_WRITING.aux_llm,
        ...config.writing.aux_llm,
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
    if (!config.aux_llm.provider_models || typeof config.aux_llm.provider_models !== 'object') {
      config.aux_llm.provider_models = {};
    }
    config.aux_llm = {
      ...DEFAULT_AUX_LLM,
      ...config.aux_llm,
      provider_models: { ...config.aux_llm.provider_models },
    };
  }

  // 补全 assistant 命名空间（新增字段）
  if (!config.assistant || typeof config.assistant !== 'object') {
    config.assistant = structuredClone(DEFAULT_ASSISTANT);
  } else {
    config.assistant = { ...DEFAULT_ASSISTANT, ...config.assistant };
  }

  if (dirty) {
    writeConfigFile(config);
  }

  return config;
}

/**
 * 部分更新配置（深度合并），返回更新后的完整配置
 */
export function updateConfig(patch) {
  const current = getConfig();
 if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
 throw new Error('配置更新必须是对象');
 }
 const merged = normalizeConfigForPersist(deepMerge(current, patch));
 writeConfigFile(merged);
  log.info(`config.update  ${formatMeta({ keys: Object.keys(patch ?? {}) })}`);
  return merged;
}

/** 取得 chat / writing 各自有效的「每章轮数」：writing.chapter_turn_size 为 null 时继承 chat 顶层。 */
export function getEffectiveChapterTurnSize(mode = 'chat') {
  const c = getConfig();
  const top = c.chapter_turn_size;
  if (mode === 'writing') {
    const w = c.writing?.chapter_turn_size;
    return w == null ? top : w;
  }
  return top;
}

/** 读取顶层共享 provider_keys 中指定 provider 的 key */
export function getProviderKey(provider) {
  if (!provider) return '';
  const config = getConfig();
  return config.provider_keys?.[provider] || '';
}

/**
 * 写入指定 provider 的 API Key 到顶层共享池
 * 所有 LLM/Embedding section 共用，不再按 section 区分
 */
export function updateProviderKey(provider, key) {
  if (!provider || typeof provider !== 'string') {
    throw new Error('provider 必须为字符串');
  }
  const current = getConfig();
  if (!current.provider_keys || typeof current.provider_keys !== 'object') {
    current.provider_keys = {};
  }
  current.provider_keys[provider] = key;
  writeConfigFile(normalizeConfigForPersist(current));
  log.info(`config.update_provider_key  ${formatMeta({ provider, hasKey: !!key })}`);
  return current;
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
      api_key: config.provider_keys?.[config.llm.provider] || '',
      base_url: config.llm.base_url,
      model: config.llm.model,
      thinking_level: config.llm.thinking_level ?? null,
    };
  }

  return {
    provider: auxLlm.provider,
    api_key: config.provider_keys?.[auxLlm.provider] || '',
    base_url: auxLlm.base_url,
    model: auxLlm.model,
    thinking_level: auxLlm.thinking_level ?? null,
  };
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
      api_key: config.provider_keys?.[config.llm.provider] || '',
      base_url: config.llm.base_url,
      model: config.llm.model,
    };
  }

  return {
    provider: writingLlm.provider,
    api_key: config.provider_keys?.[writingLlm.provider] || '',
    base_url: writingLlm.base_url,
    model: writingLlm.model,
  };
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
      api_key: config.provider_keys?.[writingAux.provider] || '',
      base_url: writingAux.base_url,
      model: writingAux.model,
      thinking_level: writingAux.thinking_level ?? null,
    };
  }

  // 回退到对话副模型（getAuxLlmConfig 内部再次回退到对话主模型）
  return getAuxLlmConfig();
}
