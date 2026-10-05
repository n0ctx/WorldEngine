/**
 * model-catalog.js — 拉取各 provider 的模型列表 + LLM 连通性验证
 */

import { validateModelFetchBaseUrl } from '../utils/network-safety.js';
import { complete } from '../llm/index.js';
import { DEFAULT_BASE_URLS } from '../llm/providers/_shared/base-urls.js';
import { extractProviderError } from '../llm/providers/_shared/fetch-utils.js';
import { ANTHROPIC_API_VERSION } from '../llm/providers/anthropic/constants.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import { OLLAMA_DEFAULT_BASE_URL, LMSTUDIO_DEFAULT_BASE_URL, LLAMACPP_DEFAULT_BASE_URL } from '../utils/constants.js';
import { getDynamicPricingOrEmpty, lookupPricingFromMap, getFallbackPricing, KNOWN_PRICES, toPrice1M } from './model-pricing.js';

const log = createLogger('config', 'blue');

// ============================================================
// 模型列表拉取 — 公共逻辑
// ============================================================

/**
 * OpenAI-compatible 模型列表拉取（通用）
 * 适用于：OpenAI / OpenRouter / GLM / Kimi / MiniMax / DeepSeek / Grok / SiliconFlow / LM Studio / llama.cpp
 * 返回 { id, inputPrice?, outputPrice? }[]，价格单位 $/1M tokens
 * 目前只有 OpenRouter 在模型列表 API 中返回价格
 */
const OPENAI_COMPATIBLE_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  glm: 'https://api.z.ai/api/paas/v4',
  'glm-coding': 'https://api.z.ai/api/coding/paas/v4',
  kimi: 'https://api.moonshot.cn/v1',
  'kimi-coding': 'https://api.kimi.com/coding/v1',
  minimax: 'https://api.minimax.chat/v1',
  deepseek: 'https://api.deepseek.com',
  grok: 'https://api.x.ai/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  lmstudio: LMSTUDIO_DEFAULT_BASE_URL,
  llamacpp: LLAMACPP_DEFAULT_BASE_URL,
};

async function fetchOpenAICompatibleModels(base, apiKey, provider) {
  const url = `${base.replace(/\/+$/, '')}/models`;
  const headers = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const dynamicPrices = await getDynamicPricingOrEmpty(provider);
  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  const data = await resp.json();
  const providerError = extractProviderError(data);
  if (providerError) throw new Error(providerError);
  return (data.data || []).map((m) => {
    const entry = { id: m.id };
    // OpenRouter 在模型列表中返回 pricing 字段（优先级最高）
    if (provider === 'openrouter' && m.pricing) {
      const inp = toPrice1M(m.pricing.prompt);
      const out = toPrice1M(m.pricing.completion);
      if (inp != null) entry.inputPrice = inp;
      if (out != null) entry.outputPrice = out;
    } else {
      // 其他 provider：优先用动态官方价格，失败再回退静态表
      const known = lookupPricingFromMap(dynamicPrices, m.id) || getFallbackPricing(m.id);
      if (known) Object.assign(entry, known);
    }
    return entry;
  });
}

function getStaticCodingPlanModels(provider) {
  switch (provider) {
    case 'kimi-coding':
      return [{ id: 'kimi-for-coding', ...KNOWN_PRICES.get('kimi-for-coding') }];
    case 'minimax-coding':
      return [
        'MiniMax-M2.7',
        'MiniMax-M2.7-highspeed',
        'MiniMax-M2.5',
        'MiniMax-M2.5-highspeed',
        'MiniMax-M2.1',
        'MiniMax-M2.1-highspeed',
        'MiniMax-M2',
      ].map((id) => ({ id, ...KNOWN_PRICES.get(id) }));
    case 'glm-coding':
      return [
        'GLM-5.1',
        'GLM-5',
        'GLM-5-Turbo',
        'GLM-4.7',
        'GLM-4.5-Air',
      ].map((id) => ({ id, ...KNOWN_PRICES.get(id) }));
    case 'xiaomi':
      return [];
    default:
      return null;
  }
}

export async function fetchModels(provider, apiKey, baseUrl) {
  const staticModels = getStaticCodingPlanModels(provider);
  if (staticModels) {
    // kimi-coding 的模型列表端点走 OpenAI 兼容协议（/coding/v1/models，与 chat 的 /coding 不同源），
    // 优先动态拉取真实模型名（随会员档位变化），失败或无 Key 时回退静态表
    if (provider === 'kimi-coding') {
      try {
        const models = await fetchOpenAICompatibleModels(OPENAI_COMPATIBLE_BASE_URLS['kimi-coding'], apiKey, provider);
        if (models.length) return models;
      } catch (error) {
        log.warn(`models.dynamic_fetch_failed ${formatMeta({ provider, error: error.message })}`);
      }
    }
    return staticModels;
  }

  // Anthropic — 原生 /v1/models 接口
  if (provider === 'anthropic') {
    if (!apiKey) throw new Error('Anthropic 需要 API Key 才能拉取模型列表');
    const base = (baseUrl || DEFAULT_BASE_URLS.anthropic).replace(/\/+$/, '');
    const resp = await fetch(`${base}/v1/models`, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
    });
    if (!resp.ok) {
      let providerError = null;
      try {
        providerError = extractProviderError(await resp.json());
      } catch { /* not JSON */ }
      throw new Error(providerError || `API ${resp.status}`);
    }
    const data = await resp.json();
    const dynamicPrices = await getDynamicPricingOrEmpty('anthropic', provider);
    return (data.data || []).map((m) => {
      const known = lookupPricingFromMap(dynamicPrices, m.id) || getFallbackPricing(m.id) || {};
      return { id: m.id, ...known };
    });
  }

  // Gemini — 原生接口（暂无价格）
  if (provider === 'gemini') {
    const dynamicPrices = await getDynamicPricingOrEmpty(provider);
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );
    if (!resp.ok) throw new Error(`Gemini API ${resp.status}`);
    const data = await resp.json();
    return (data.models || []).map((m) => {
      const id = m.name.replace(/^models\//, '');
      const known = lookupPricingFromMap(dynamicPrices, id) || getFallbackPricing(id) || {};
      return { id, ...known };
    });
  }

  // Ollama — 专有 /api/tags 接口（本地无价格）
  if (provider === 'ollama') {
    const url = validateModelFetchBaseUrl(provider, baseUrl || OLLAMA_DEFAULT_BASE_URL);
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

export async function verifyLlmConnection(llmConfig) {
  const llm = {
    ...llmConfig,
    base_url: validateModelFetchBaseUrl(llmConfig.provider, llmConfig.base_url || DEFAULT_BASE_URLS[llmConfig.provider] || ''),
    max_tokens: 8,
    temperature: 0,
    signal: AbortSignal.timeout(20_000),
  };

  if (!llm.model) {
    const models = await fetchModels(llm.provider, llm.api_key, llm.base_url);
    llm.model = models[0]?.id || '';
  }
  if (!llm.model) throw new Error('当前 provider 没有可用模型');

  await complete([{ role: 'user', content: 'ping' }], llm);
}

/** 用已解析的单个模型配置（含 api_key）发一次最小请求验证连通性 */
export function verifyModelConnection(modelConfig) {
  return verifyLlmConnection({
    provider: modelConfig.provider,
    api_key: (modelConfig.provider && modelConfig.api_key) || '',
    base_url: modelConfig.base_url || '',
    model: modelConfig.model || '',
    max_tokens: 8,
    temperature: 0,
  });
}
