import { Router } from 'express';
import { getConfig, updateConfig } from '../services/config.js';

const router = Router();

/** 从配置对象中移除敏感的 API Key 字段 */
function stripApiKeys(config) {
  const safe = structuredClone(config);
  if (safe.llm) delete safe.llm.api_key;
  if (safe.embedding) delete safe.embedding.api_key;
  return safe;
}

// GET /api/config — 返回当前配置（去掉 api_key）
router.get('/', (_req, res) => {
  const config = getConfig();
  res.json(stripApiKeys(config));
});

// PUT /api/config — 部分更新配置（禁止通过此接口更新 api_key）
router.put('/', (req, res) => {
  const patch = req.body;
  // 防止通过此接口更新 api_key
  if (patch.llm) delete patch.llm.api_key;
  if (patch.embedding) delete patch.embedding.api_key;
  const updated = updateConfig(patch);
  res.json(stripApiKeys(updated));
});

// PUT /api/config/apikey — 只更新 llm.api_key
router.put('/apikey', (req, res) => {
  const { api_key } = req.body;
  if (typeof api_key !== 'string') {
    return res.status(400).json({ error: 'api_key 必须为字符串' });
  }
  updateConfig({ llm: { api_key } });
  res.json({ success: true });
});

// PUT /api/config/embedding-apikey — 只更新 embedding.api_key
router.put('/embedding-apikey', (req, res) => {
  const { api_key } = req.body;
  if (typeof api_key !== 'string') {
    return res.status(400).json({ error: 'api_key 必须为字符串' });
  }
  updateConfig({ embedding: { api_key } });
  res.json({ success: true });
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

async function fetchModels(provider, apiKey, baseUrl) {
  switch (provider) {
    case 'openai': {
      const resp = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!resp.ok) throw new Error(`OpenAI API ${resp.status}`);
      const data = await resp.json();
      return data.data.map((m) => m.id);
    }
    case 'anthropic': {
      return ANTHROPIC_MODELS;
    }
    case 'gemini': {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      );
      if (!resp.ok) throw new Error(`Gemini API ${resp.status}`);
      const data = await resp.json();
      return (data.models || []).map((m) => m.name);
    }
    case 'ollama': {
      const url = (baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
      const resp = await fetch(`${url}/api/tags`);
      if (!resp.ok) throw new Error(`Ollama API ${resp.status}`);
      const data = await resp.json();
      return (data.models || []).map((m) => m.name);
    }
    case 'lmstudio': {
      const url = (baseUrl || 'http://localhost:1234').replace(/\/+$/, '');
      const resp = await fetch(`${url}/v1/models`);
      if (!resp.ok) throw new Error(`LM Studio API ${resp.status}`);
      const data = await resp.json();
      return data.data.map((m) => m.id);
    }
    default:
      throw new Error(`不支持的 provider: ${provider}`);
  }
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
