import { Router } from 'express';
import { getConfig, updateConfig } from '../services/config.js';
import { validateModelFetchBaseUrl } from '../utils/network-safety.js';

const router = Router();

/** 从配置对象中移除敏感的 API Key 字段，保留 has_key 布尔标志 */
function stripApiKeys(config) {
  const safe = structuredClone(config);
  if (safe.llm) { safe.llm.has_key = !!safe.llm.api_key; delete safe.llm.api_key; }
  if (safe.embedding) { safe.embedding.has_key = !!safe.embedding.api_key; delete safe.embedding.api_key; }
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

// PUT /api/config — 部分更新配置（禁止通过此接口更新 api_key）
router.put('/', (req, res) => {
  try {
    const patch = structuredClone(req.body);
    if (patch.llm) {
      delete patch.llm.api_key;
      sanitizeBaseUrlPatch(patch.llm);
    }
    if (patch.embedding) {
      delete patch.embedding.api_key;
      sanitizeBaseUrlPatch(patch.embedding);
    }

    const updated = updateConfig(patch);
    res.json(stripApiKeys(updated));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/config/apikey — 只更新 llm.api_key
router.put('/apikey', (req, res) => {
  const { api_key } = req.body;
  if (typeof api_key !== 'string') {
    return res.status(400).json({ error: 'api_key 必须为字符串' });
  }
  try {
    updateConfig({ llm: { api_key } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: `保存失败：${err.message}` });
  }
});

// PUT /api/config/embedding-apikey — 只更新 embedding.api_key
router.put('/embedding-apikey', (req, res) => {
  const { api_key } = req.body;
  if (typeof api_key !== 'string') {
    return res.status(400).json({ error: 'api_key 必须为字符串' });
  }
  try {
    updateConfig({ embedding: { api_key } });
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
    return (data.models || []).map((m) => m.name);
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
  const { provider, api_key, base_url } = config.llm;
  try {
    const models = await fetchModels(provider, api_key, base_url);
    res.json({ models });
  } catch (err) {
    res.status(502).json({ error: '无法获取模型列表，请检查 API Key 和网络连接' });
  }
});

// GET /api/config/embedding-models — 拉取 Embedding 模型列表
router.get('/embedding-models', async (_req, res) => {
  const config = getConfig();
  const { provider, api_key, base_url } = config.embedding;
  if (!provider) {
    return res.json({ models: [] });
  }
  try {
    const models = await fetchModels(provider, api_key, base_url);
    res.json({ models });
  } catch (err) {
    res.status(502).json({ error: '无法获取模型列表，请检查 API Key 和网络连接' });
  }
});

// GET /api/config/test-connection — 验证 LLM 连通性
router.get('/test-connection', async (_req, res) => {
  const config = getConfig();
  const { provider, api_key, base_url } = config.llm;
  try {
    await fetchModels(provider, api_key, base_url);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

export default router;
