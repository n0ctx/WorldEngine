/**
 * Embedding 服务
 *
 * 对外暴露：
 *   embed(text) → Promise<number[] | null>
 *
 * 支持的 provider：
 *   null / 未配置    → 返回 null，不报错
 *   "openai"         → OpenAI 官方 embeddings API
 *   "openai_compatible" → 兼容 OpenAI embeddings API 的第三方服务
 *                       （OpenRouter、硅基流动、Qwen 系列等）
 *   "ollama"         → Ollama 本地 embedding
 */

import { getConfig } from '../services/config.js';
import { OLLAMA_DEFAULT_BASE_URL } from '../utils/constants.js';

// ─── 默认 Base URL ───────────────────────────────────────────────

const DEFAULT_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
};

const OLLAMA_DEFAULT_BASE = OLLAMA_DEFAULT_BASE_URL;

// ─── 工具 ────────────────────────────────────────────────────────

function embeddingError(provider, message) {
  const err = new Error(`[embedding:${provider}] ${message}`);
  err.provider = provider;
  return err;
}

function getEmbeddingConfig() {
  const config = getConfig();
  const { embedding } = config;
  if (!embedding) return null;
  return {
    ...embedding,
    api_key: config.provider_keys?.[embedding.provider] || '',
  };
}

// ─── OpenAI / OpenAI-compatible ──────────────────────────────────

async function embedOpenAI(text, cfg) {
  const baseUrl = (cfg.base_url || DEFAULT_BASE_URLS.openai).replace(/\/+$/, '');
  const url = `${baseUrl}/embeddings`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.api_key}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      input: text,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw embeddingError(cfg.provider, `HTTP ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  const vector = data?.data?.[0]?.embedding;

  if (!Array.isArray(vector) || vector.some((v) => typeof v !== 'number')) {
    throw embeddingError(cfg.provider, 'Invalid embedding response: expected number[]');
  }

  return vector;
}

// ─── Ollama ──────────────────────────────────────────────────────

async function embedOllama(text, cfg) {
  const baseUrl = (cfg.base_url || OLLAMA_DEFAULT_BASE).replace(/\/+$/, '');
  const url = `${baseUrl}/api/embeddings`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      prompt: text,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw embeddingError('ollama', `HTTP ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  const vector = data?.embedding;

  if (!Array.isArray(vector) || vector.some((v) => typeof v !== 'number')) {
    throw embeddingError('ollama', 'Invalid embedding response: expected number[]');
  }

  return vector;
}

// ─── 对外接口 ────────────────────────────────────────────────────

/**
 * 将文本转为 embedding 向量
 *
 * @param {string} text
 * @returns {Promise<number[] | null>}  未配置时返回 null
 */
export async function embed(text) {
  const cfg = getEmbeddingConfig();

  if (!cfg || !cfg.provider) return null;

  const { provider } = cfg;

  if (provider === 'openai' || provider === 'openai_compatible') {
    return embedOpenAI(text, cfg);
  }

  if (provider === 'ollama') {
    return embedOllama(text, cfg);
  }

  throw embeddingError(provider, `不支持的 embedding provider: ${provider}`);
}
