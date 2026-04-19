import { Router } from 'express';
import { getConfig, updateConfig } from '../services/config.js';
import { validateModelFetchBaseUrl } from '../utils/network-safety.js';
import { applyProxy } from '../utils/proxy.js';

const router = Router();

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
  res.json(stripApiKeys(config));
});

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
    if ('proxy_url' in patch) applyProxy(updated.proxy_url || '');
    res.json(stripApiKeys(updated));
  } catch (err) {
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
    res.json({ success: true });
  } catch (err) {
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
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: `保存失败：${err.message}` });
  }
});

// ============================================================
// 模型列表拉取 — 公共逻辑
// ============================================================

const ANTHROPIC_MODELS = [
  'claude-opus-4-5',
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
  'claude-opus-4-0',
  'claude-sonnet-4-0',
];

/**
 * OpenAI-compatible 模型列表拉取（通用）
 * 适用于：OpenAI / OpenRouter / GLM / Kimi / MiniMax / DeepSeek / Grok / SiliconFlow / LM Studio
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

async function fetchOpenAICompatibleModels(base, apiKey) {
  const url = `${base.replace(/\/+$/, '')}/models`;
  const headers = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  const data = await resp.json();
  return (data.data || []).map((m) => m.id);
}

async function fetchModels(provider, apiKey, baseUrl) {
  // Anthropic — 硬编码
  if (provider === 'anthropic') return ANTHROPIC_MODELS;

  // Gemini — 原生接口
  if (provider === 'gemini') {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );
    if (!resp.ok) throw new Error(`Gemini API ${resp.status}`);
    const data = await resp.json();
    return (data.models || []).map((m) => m.name.replace(/^models\//, ''));
  }

  // Ollama — 专有 /api/tags 接口
  if (provider === 'ollama') {
    const url = validateModelFetchBaseUrl(provider, baseUrl || 'http://localhost:11434');
    const resp = await fetch(`${url}/api/tags`);
    if (!resp.ok) throw new Error(`Ollama API ${resp.status}`);
    const data = await resp.json();
    return (data.models || []).map((m) => m.name);
  }

  // OpenAI-compatible 一族（含无默认 URL 的 openai_compatible）
  const defaultBase = OPENAI_COMPATIBLE_BASE_URLS[provider];
  if (defaultBase !== undefined || provider === 'openai_compatible') {
    const base = validateModelFetchBaseUrl(provider, baseUrl || defaultBase);
    if (!base) throw new Error('openai_compatible provider 需要指定 Base URL');
    return fetchOpenAICompatibleModels(base, apiKey);
  }

  throw new Error(`不支持的 provider: ${provider}`);
}

// GET /api/config/models — 拉取 LLM 模型列表
router.get('/models', async (_req, res) => {
  const config = getConfig();
  const { provider, base_url } = config.llm;
  const apiKey = resolveApiKey(config.llm);
  try {
    const models = await fetchModels(provider, apiKey, base_url);
    res.json({ models });
  } catch (err) {
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
    res.json({ models });
  } catch (err) {
    res.status(502).json({ error: '无法获取模型列表，请检查 API Key 和网络连接' });
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
