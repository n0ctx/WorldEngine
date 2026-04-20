import { Router } from 'express';
import { getConfig, updateConfig } from '../services/config.js';
import { validateModelFetchBaseUrl } from '../utils/network-safety.js';
import { applyProxy } from '../utils/proxy.js';
import { embed } from '../llm/embedding.js';
import { createLogger, formatMeta, getLoggingConfig } from '../utils/logger.js';

const router = Router();
const log = createLogger('config', 'blue');

/** 获取当前 provider 的 API Key */
function resolveApiKey(section) {
  if (!section) return '';
  return section.provider_keys?.[section.provider] || '';
}

/** 从配置对象中移除敏感字段，保留 has_key 布尔标志和 provider_keys 布尔映射 */
function stripApiKeys(config) {
  const safe = structuredClone(config);
  if (safe.llm) {
    safe.llm.has_key = !!resolveApiKey(safe.llm);
    safe.llm.provider_keys = Object.fromEntries(
      Object.entries(safe.llm.provider_keys || {}).map(([k, v]) => [k, !!v]),
    );
  }
  if (safe.embedding) {
    safe.embedding.has_key = !!resolveApiKey(safe.embedding);
    safe.embedding.provider_keys = Object.fromEntries(
      Object.entries(safe.embedding.provider_keys || {}).map(([k, v]) => [k, !!v]),
    );
  }
  return safe;
}

function sanitizeBaseUrlPatch(section) {
  if (!section || !('base_url' in section)) {
    return;
  }

  section.base_url = validateModelFetchBaseUrl(section.provider, section.base_url);
}

// GET /api/config — 返回当前配置（去掉 api_key）
router.get('/', (_req, res) => {
  const config = getConfig();
  const logging = getLoggingConfig();
  log.debug(`GET /api/config  ${formatMeta({ loggingMode: logging.mode, prompt: logging.prompt?.enabled, llmRaw: logging.llm_raw?.enabled })}`);
  res.json(stripApiKeys(config));
});

function collectPatchPaths(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  const paths = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      const nested = collectPatchPaths(child, path);
      paths.push(...(nested.length ? nested : [path]));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

/**
 * 处理 provider 切换时的 provider_models 自动存取：
 * - 保存当前 model 到 provider_models[current_provider]
 * - 恢复 provider_models[new_provider] 作为切换后的 model
 * - 若 model 只是单独更新，同步写入 provider_models[current_provider]
 */
function applyProviderModelLogic(sectionPatch, currentSection) {
  if (!sectionPatch || !currentSection) return;

  const isProviderChange = 'provider' in sectionPatch && sectionPatch.provider !== currentSection.provider;
  const providerModels = { ...(currentSection.provider_models || {}) };

  if (isProviderChange) {
    // 保存当前 model
    if (currentSection.model) {
      providerModels[currentSection.provider] = currentSection.model;
    }
    // 恢复新 provider 上次的 model（覆盖 patch 里可能传来的空字符串）
    sectionPatch.model = providerModels[sectionPatch.provider] || '';
    sectionPatch.provider_models = providerModels;
  } else if ('model' in sectionPatch && sectionPatch.model) {
    // 单独改 model 时，顺手保存
    providerModels[currentSection.provider] = sectionPatch.model;
    sectionPatch.provider_models = providerModels;
  }
}

// PUT /api/config — 部分更新配置（禁止通过此接口更新 api_key / provider_keys）
router.put('/', (req, res) => {
  try {
    const current = getConfig();
    const patch = structuredClone(req.body);
    const patchPaths = collectPatchPaths(patch);
    if (patch.llm) {
      delete patch.llm.api_key;
      delete patch.llm.provider_keys;
      sanitizeBaseUrlPatch(patch.llm);
      applyProviderModelLogic(patch.llm, current.llm);
    }
    if (patch.embedding) {
      delete patch.embedding.api_key;
      delete patch.embedding.provider_keys;
      sanitizeBaseUrlPatch(patch.embedding);
      applyProviderModelLogic(patch.embedding, current.embedding);
    }

    const updated = updateConfig(patch);
    const loggingChanged = patchPaths.some((path) => path === 'logging' || path.startsWith('logging.'));
    log.info(`PUT /api/config  ${formatMeta({
      fields: patchPaths,
      loggingChanged,
      loggingMode: updated.logging?.mode,
      prompt: updated.logging?.prompt?.enabled,
      llmRaw: updated.logging?.llm_raw?.enabled,
    })}`);
    if ('proxy_url' in patch) applyProxy(updated.proxy_url || '');
    res.json(stripApiKeys(updated));
  } catch (err) {
    log.warn(`PUT /api/config FAIL  ${formatMeta({ error: err.message })}`);
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/config/apikey — 写入当前 llm provider 的 key
router.put('/apikey', (req, res) => {
  const { api_key } = req.body;
  if (typeof api_key !== 'string') {
    return res.status(400).json({ error: 'api_key 必须为字符串' });
  }
  try {
    const config = getConfig();
    const provider = config.llm.provider;
    updateConfig({ llm: { provider_keys: { [provider]: api_key } } });
    log.info(`PUT /api/config/apikey  ${formatMeta({ section: 'llm', provider, hasKey: !!api_key })}`);
    res.json({ success: true });
  } catch (err) {
    log.error(`PUT /api/config/apikey FAIL  ${formatMeta({ error: err.message })}`);
    res.status(500).json({ error: `保存失败：${err.message}` });
  }
});

// PUT /api/config/embedding-apikey — 写入当前 embedding provider 的 key
router.put('/embedding-apikey', (req, res) => {
  const { api_key } = req.body;
  if (typeof api_key !== 'string') {
    return res.status(400).json({ error: 'api_key 必须为字符串' });
  }
  try {
    const config = getConfig();
    const provider = config.embedding.provider;
    updateConfig({ embedding: { provider_keys: { [provider]: api_key } } });
    log.info(`PUT /api/config/embedding-apikey  ${formatMeta({ section: 'embedding', provider, hasKey: !!api_key })}`);
    res.json({ success: true });
  } catch (err) {
    log.error(`PUT /api/config/embedding-apikey FAIL  ${formatMeta({ error: err.message })}`);
    res.status(500).json({ error: `保存失败：${err.message}` });
  }
});

// ============================================================
// 模型列表拉取 — 公共逻辑
// ============================================================

// 价格单位：美元 / 1M tokens
const ANTHROPIC_MODELS = [
  { id: 'claude-opus-4-5',   inputPrice: 15,  outputPrice: 75 },
  { id: 'claude-sonnet-4-5', inputPrice: 3,   outputPrice: 15 },
  { id: 'claude-haiku-4-5',  inputPrice: 0.8, outputPrice: 4  },
  { id: 'claude-opus-4-0',   inputPrice: 15,  outputPrice: 75 },
  { id: 'claude-sonnet-4-0', inputPrice: 3,   outputPrice: 15 },
];

/**
 * OpenAI-compatible 模型列表拉取（通用）
 * 适用于：OpenAI / OpenRouter / GLM / Kimi / MiniMax / DeepSeek / Grok / SiliconFlow / LM Studio
 * 返回 { id, inputPrice?, outputPrice? }[]，价格单位 $/1M tokens
 * 目前只有 OpenRouter 在模型列表 API 中返回价格
 */
const OPENAI_COMPATIBLE_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  glm: 'https://open.bigmodel.cn/api/paas/v4',
  kimi: 'https://api.moonshot.cn/v1',
  minimax: 'https://api.minimax.chat/v1',
  deepseek: 'https://api.deepseek.com',
  grok: 'https://api.x.ai/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  lmstudio: 'http://localhost:1234',
};

function toPrice1M(perToken) {
  const n = parseFloat(perToken);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const v = n * 1_000_000;
  return Math.round(v * 100) / 100;
}

async function fetchOpenAICompatibleModels(base, apiKey, provider) {
  const url = `${base.replace(/\/+$/, '')}/models`;
  const headers = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  const data = await resp.json();
  return (data.data || []).map((m) => {
    const entry = { id: m.id };
    // OpenRouter 在模型列表中返回 pricing 字段
    if (provider === 'openrouter' && m.pricing) {
      const inp = toPrice1M(m.pricing.prompt);
      const out = toPrice1M(m.pricing.completion);
      if (inp != null) entry.inputPrice = inp;
      if (out != null) entry.outputPrice = out;
    }
    return entry;
  });
}

async function fetchModels(provider, apiKey, baseUrl) {
  // Anthropic — 硬编码（含价格）
  if (provider === 'anthropic') return ANTHROPIC_MODELS;

  // Gemini — 原生接口（暂无价格）
  if (provider === 'gemini') {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );
    if (!resp.ok) throw new Error(`Gemini API ${resp.status}`);
    const data = await resp.json();
    return (data.models || []).map((m) => ({ id: m.name.replace(/^models\//, '') }));
  }

  // Ollama — 专有 /api/tags 接口（本地无价格）
  if (provider === 'ollama') {
    const url = validateModelFetchBaseUrl(provider, baseUrl || 'http://localhost:11434');
    const resp = await fetch(`${url}/api/tags`);
    if (!resp.ok) throw new Error(`Ollama API ${resp.status}`);
    const data = await resp.json();
    return (data.models || []).map((m) => ({ id: m.name }));
  }

  // OpenAI-compatible 一族（含无默认 URL 的 openai_compatible）
  const defaultBase = OPENAI_COMPATIBLE_BASE_URLS[provider];
  if (defaultBase !== undefined || provider === 'openai_compatible') {
    const base = validateModelFetchBaseUrl(provider, baseUrl || defaultBase);
    if (!base) throw new Error('openai_compatible provider 需要指定 Base URL');
    return fetchOpenAICompatibleModels(base, apiKey, provider);
  }

  throw new Error(`不支持的 provider: ${provider}`);
}

/**
 * 返回当前 provider 支持的 thinking 级别选项
 * 空数组表示该 provider 不支持 API 级别的 thinking 配置
 * （DeepSeek R1 等模型天然输出 <think> 标签，无需此处配置）
 */
function getThinkingOptions(provider) {
  switch (provider) {
    case 'anthropic':
    case 'gemini':
      return [
        { value: 'budget_low', label: '思考：低（1024 tokens）' },
        { value: 'budget_medium', label: '思考：中（8192 tokens）' },
        { value: 'budget_high', label: '思考：高（16384 tokens）' },
      ];
    case 'openai':
      return [
        { value: 'effort_low', label: '推理：低（仅 o-series 模型）' },
        { value: 'effort_medium', label: '推理：中（仅 o-series 模型）' },
        { value: 'effort_high', label: '推理：高（仅 o-series 模型）' },
      ];
    default:
      return [];
  }
}

// GET /api/config/models — 拉取 LLM 模型列表
router.get('/models', async (_req, res) => {
  const config = getConfig();
  const { provider, base_url } = config.llm;
  const apiKey = resolveApiKey(config.llm);
  try {
    const models = await fetchModels(provider, apiKey, base_url);
    const thinkingOptions = getThinkingOptions(provider);
    log.info(`GET /api/config/models  ${formatMeta({ provider, count: models.length, thinkingOptions: thinkingOptions.length })}`);
    res.json({ models, thinkingOptions });
  } catch (err) {
    log.warn(`GET /api/config/models FAIL  ${formatMeta({ provider, error: err.message })}`);
    res.status(502).json({ error: '无法获取模型列表，请检查 API Key 和网络连接' });
  }
});

// GET /api/config/embedding-models — 拉取 Embedding 模型列表
router.get('/embedding-models', async (_req, res) => {
  const config = getConfig();
  const { provider, base_url } = config.embedding;
  if (!provider) {
    return res.json({ models: [] });
  }
  const apiKey = resolveApiKey(config.embedding);
  try {
    const models = await fetchModels(provider, apiKey, base_url);
    log.info(`GET /api/config/embedding-models  ${formatMeta({ provider, count: models.length })}`);
    res.json({ models });
  } catch (err) {
    log.warn(`GET /api/config/embedding-models FAIL  ${formatMeta({ provider, error: err.message })}`);
    res.status(502).json({ error: '无法获取模型列表，请检查 API Key 和网络连接' });
  }
});

// GET /api/config/test-embedding — 验证 Embedding 连通性（不保存结果）
router.get('/test-embedding', async (_req, res) => {
  const config = getConfig();
  if (!config.embedding?.provider) {
    return res.json({ success: false, error: '未配置 Embedding provider' });
  }
  try {
    const vector = await embed('Hello');
    if (!Array.isArray(vector)) {
      return res.json({ success: false, error: '未返回有效向量' });
    }
    res.json({ success: true, dimensions: vector.length });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// GET /api/config/test-connection — 验证 LLM 连通性
router.get('/test-connection', async (_req, res) => {
  const config = getConfig();
  const { provider, base_url } = config.llm;
  const apiKey = resolveApiKey(config.llm);
  try {
    await fetchModels(provider, apiKey, base_url);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

export default router;
