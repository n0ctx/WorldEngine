/**
 * model-context-limit.js — 解析当前模型的上下文上限（token 数）
 *
 * 云端从模型列表接口取，llama.cpp / LM Studio 取已加载模型的实际上下文长度；
 * 取不到（接口不返回、请求失败或超时）一律用 DEFAULT_CONTEXT_LIMIT。
 */

import { getConfig, getAuxLlmConfig } from './config.js';
import { fetchModels } from './model-catalog.js';
import { DEFAULT_BASE_URLS } from '../llm/providers/_shared/base-urls.js';
import { validateModelFetchBaseUrl } from '../utils/network-safety.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const log = createLogger('config', 'blue');

export const DEFAULT_CONTEXT_LIMIT = 122_880;
const FETCH_TIMEOUT_MS = 3000;
const RESOLVED_TTL_MS = 60 * 60 * 1000;
const FALLBACK_TTL_MS = 5 * 60 * 1000;

const cache = new Map();

function positiveInt(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

async function fetchJson(url) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  return resp.json();
}

function localBaseUrl(provider, baseUrl) {
  return validateModelFetchBaseUrl(provider, baseUrl || DEFAULT_BASE_URLS[provider]);
}

async function fetchLlamaCppLimit({ provider, base_url: baseUrl }) {
  const props = await fetchJson(`${localBaseUrl(provider, baseUrl)}/props`);
  return positiveInt(props?.default_generation_settings?.n_ctx);
}

async function fetchLmStudioLimit({ provider, base_url: baseUrl, model }) {
  const data = await fetchJson(`${localBaseUrl(provider, baseUrl)}/api/v0/models`);
  const entry = (data?.data || []).find((m) => m.id === model);
  return positiveInt(entry?.loaded_context_length);
}

async function fetchCatalogLimit({ provider, api_key: apiKey, base_url: baseUrl, model }) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), FETCH_TIMEOUT_MS);
  });
  try {
    const models = await Promise.race([fetchModels(provider, apiKey, baseUrl), timeout]);
    return positiveInt(models.find((m) => m.id === model)?.contextLimit);
  } finally {
    clearTimeout(timer);
  }
}

const LOCAL_FETCHERS = {
  llamacpp: fetchLlamaCppLimit,
  lmstudio: fetchLmStudioLimit,
  // Ollama 的接口只给模型训练上限，不是实际运行的上下文长度，不取
  ollama: async () => null,
};

/**
 * @param {'main'|'aux'} configScope
 * @returns {Promise<number>}
 */
export async function resolveContextLimit(configScope) {
  const config = getConfig();
  const llm = configScope === 'aux'
    ? getAuxLlmConfig()
    : { ...config.llm, api_key: config.provider_keys?.[config.llm.provider] || '' };
  const key = `${llm.provider}|${llm.base_url || ''}|${llm.model || ''}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.limit;

  let limit = null;
  try {
    limit = await (LOCAL_FETCHERS[llm.provider] ?? fetchCatalogLimit)(llm);
  } catch (err) {
    log.warn(`CONTEXT_LIMIT FETCH_FAILED  ${formatMeta({ provider: llm.provider, model: llm.model || '', error: err.message })}`);
  }
  cache.set(key, {
    limit: limit ?? DEFAULT_CONTEXT_LIMIT,
    expires: Date.now() + (limit ? RESOLVED_TTL_MS : FALLBACK_TTL_MS),
  });
  return limit ?? DEFAULT_CONTEXT_LIMIT;
}
