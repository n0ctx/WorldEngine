import { Router } from 'express';
import { getConfig, updateConfig } from '../services/config.js';
import { validateModelFetchBaseUrl } from '../utils/network-safety.js';
import { applyProxy } from '../utils/proxy.js';

const router = Router();

/**
 * 获取某个 section 的有效 API Key
 * 优先用 provider_keys[provider]；
 * 仅当 provider_keys 完全为空时（旧配置迁移前）才降级到 api_key。
 * 避免多 provider 之间的 key 互相污染。
 */
function resolveApiKey(section) {
  if (!section) return '';
  if (section.provider_keys?.[section.provider]) {
    return section.provider_keys[section.provider];
  }
  const hasAnyKey = section.provider_keys && Object.values(section.provider_keys).some(Boolean);
  if (!hasAnyKey) return section.api_key || '';
  return '';
}

/** 从配置对象中移除敏感字段，保留 has_key 布尔标志和 provider_keys 布尔映射 */
function stripApiKeys(config) {
  const safe = structuredClone(config);
  if (safe.llm) {
    safe.llm.has_key = !!resolveApiKey(safe.llm);
    safe.llm.provider_keys = Object.fromEntries(
      Object.entries(safe.llm.provider_keys || {}).map(([k, v]) => [k, !!v]),
    );
    delete safe.llm.api_key;
  }
  if (safe.embedding) {
    safe.embedding.has_key = !!resolveApiKey(safe.embedding);
    safe.embedding.provider_keys = Object.fromEntries(
      Object.entries(safe.embedding.provider_keys || {}).map(([k, v]) => [k, !!v]),
    );
    delete safe.embedding.api_key;
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

// PUT /api/config — 部分更新配置（禁止通过此接口更新 api_key / provider_keys）
router.put('/', (req, res) => {
  try {
    const patch = structuredClone(req.body);
    if (patch.llm) {
      delete patch.llm.api_key;
      delete patch.llm.provider_keys;
      sanitizeBaseUrlPatch(patch.llm);
    }
    if (patch.embedding) {
      delete patch.embedding.api_key;
      delete patch.embedding.provider_keys;
      sanitizeBaseUrlPatch(patch.embedding);
    }

    const updated = updateConfig(patch);
    if ('proxy_url' in patch) applyProxy(updated.proxy_url || '');
    res.json(stripApiKeys(updated));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/config/apikey — 更新 llm.api_key，同时写入当前 provider 的 provider_keys slot
router.put('/apikey', (req, res) => {
  const { api_key } = req.body;
  if (typeof api_key !== 'string') {
    return res.status(400).json({ error: 'api_key 必须为字符串' });
  }
  try {
    const config = getConfig();
    const provider = config.llm.provider;
    updateConfig({
      llm: {
        api_key,
        provider_keys: { ...config.llm.provider_keys, [provider]: api_key },
      },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: `保存失败：${err.message}` });
  }
});

// PUT /api/config/embedding-apikey — 更新 embedding.api_key，同时写入当前 provider 的 slot
router.put('/embedding-apikey', (req, res) => {
  const { api_key } = req.body;
  if (typeof api_key !== 'string') {
    return res.status(400).json({ error: 'api_key 必须为字符串' });
  }
  try {
    const config = getConfig();
    const provider = config.embedding.provider;
    updateConfig({
      embedding: {
        api_key,
        provider_keys: { ...config.embedding.provider_keys, [provider]: api_key },
      },
    });
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
