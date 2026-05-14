import { Router } from 'express';
import { getConfig, updateConfig, getAuxLlmConfig, getWritingLlmConfig, getWritingAuxLlmConfig, getProviderKey, updateProviderKey } from '../services/config.js';
import { validateModelFetchBaseUrl } from '../utils/network-safety.js';
import { applyProxy } from '../utils/proxy.js';
import { embed } from '../llm/embedding.js';
import { complete } from '../llm/index.js';
import { DEFAULT_BASE_URLS } from '../llm/providers/_shared/base-urls.js';
import { extractProviderError } from '../llm/providers/_shared/fetch-utils.js';
import { ANTHROPIC_API_VERSION } from '../llm/providers/anthropic/constants.js';
import { createLogger, formatMeta, getLoggingConfig } from '../utils/logger.js';
import { OLLAMA_DEFAULT_BASE_URL, LMSTUDIO_DEFAULT_BASE_URL } from '../utils/constants.js';

const router = Router();
const log = createLogger('config', 'blue');
const PRICING_TTL_MS = 6 * 60 * 60 * 1000;
const pricingCache = new Map();

/** 通过顶层共享池获取指定 section 当前 provider 的 API Key */
function resolveApiKey(section, sharedKeys) {
  if (!section || !section.provider) return '';
  return sharedKeys?.[section.provider] || '';
}

/**
 * 从配置对象中脱敏 API Key：
 * - 顶层 provider_keys 替换为 { provider: bool } 映射
 * - 每个 section 暴露 has_key（按其 provider 在共享池中查找）
 */
function stripApiKeys(config) {
  const safe = structuredClone(config);
  const sharedKeys = safe.provider_keys || {};
  safe.provider_keys = Object.fromEntries(
    Object.entries(sharedKeys).map(([k, v]) => [k, !!v]),
  );
  if (safe.llm) safe.llm.has_key = !!resolveApiKey(safe.llm, sharedKeys);
  if (safe.embedding) safe.embedding.has_key = !!resolveApiKey(safe.embedding, sharedKeys);
  if (safe.aux_llm) safe.aux_llm.has_key = !!resolveApiKey(safe.aux_llm, sharedKeys);
  if (safe.writing?.llm) safe.writing.llm.has_key = !!resolveApiKey(safe.writing.llm, sharedKeys);
  if (safe.writing?.aux_llm) safe.writing.aux_llm.has_key = !!resolveApiKey(safe.writing.aux_llm, sharedKeys);
  return safe;
}

function sanitizeBaseUrlPatch(section) {
  if (!section || !('base_url' in section)) {
    return;
  }

  section.base_url = validateModelFetchBaseUrl(section.provider, section.base_url);
}

function normalizeModelId(modelId) {
  return String(modelId || '').replace(/^models\//, '').trim();
}

function toPricingPayload(pricing) {
  if (!pricing) return null;
  return {
    inputPrice: pricing.inputPrice,
    outputPrice: pricing.outputPrice,
    cacheWritePrice: pricing.cacheWritePrice ?? null,
    cacheReadPrice: pricing.cacheReadPrice ?? null,
  };
}

const MODEL_PRICE_ALIASES = [
  ['gemini-2.5-flash-lite-preview', 'gemini-2.5-flash-lite'],
  ['gemini-2.5-flash-lite', 'gemini-2.5-flash-lite'],
  ['gemini-2.5-flash-preview', 'gemini-2.5-flash'],
  ['gemini-2.5-flash', 'gemini-2.5-flash'],
  ['gemini-2.5-pro-preview', 'gemini-2.5-pro'],
  ['gemini-2.5-pro', 'gemini-2.5-pro'],
  ['gemini-2.0-flash-lite', 'gemini-2.0-flash-lite'],
  ['gemini-2.0-flash', 'gemini-2.0-flash'],
  ['deepseek-v4-flash', 'deepseek-v4-flash'],
  ['deepseek-v4-pro', 'deepseek-v4-pro'],
  ['grok-4.20-multi-agent', 'grok-4.20-multi-agent-0309'],
  ['grok-4.20-0309-reasoning', 'grok-4.20-0309-reasoning'],
  ['grok-4.20-0309-non-reasoning', 'grok-4.20-0309-non-reasoning'],
  ['grok-4-1-fast-reasoning', 'grok-4-1-fast-reasoning'],
  ['grok-4-1-fast-non-reasoning', 'grok-4-1-fast-non-reasoning'],
  ['grok-4.3', 'grok-4.3'],
  ['kimi-k2.6', 'kimi-k2.6'],
  ['kimi-k2.5', 'kimi-k2.5'],
  ['kimi-k2-turbo', 'kimi-k2'],
  ['kimi-k2', 'kimi-k2'],
  ['qwen-turbo', 'qwen-turbo'],
  ['qwen-plus', 'qwen-plus'],
  ['qwen-max', 'qwen-max'],
  ['qwen3-coder-plus', 'qwen3-coder-plus'],
  ['Qwen/Qwen3-235B-A22B-Thinking', 'Qwen/Qwen3-235B-A22B-Thinking-2507'],
  ['Qwen/Qwen3-235B-A22B', 'Qwen/Qwen3-235B-A22B-Thinking-2507'],
  ['MiniMaxAI/MiniMax-M2', 'MiniMaxAI/MiniMax-M2'],
  ['moonshotai/Kimi-K2-Instruct-0905', 'moonshotai/Kimi-K2-Instruct-0905'],
];

function lookupPricingFromMap(pricingMap, modelId) {
  const normalizedId = normalizeModelId(modelId);
  if (!normalizedId || !pricingMap) return null;
  const direct = pricingMap.get(normalizedId);
  if (direct) return direct;
  for (const [prefix, target] of MODEL_PRICE_ALIASES) {
    if (normalizedId === prefix || normalizedId.startsWith(`${prefix}-`)) {
      return pricingMap.get(target) || null;
    }
  }
  return null;
}

function getFallbackPricing(modelId) {
  return lookupPricingFromMap(KNOWN_PRICES, modelId);
}

function stripHtmlToText(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, '\'')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSection(text, startMarker, endMarkers = []) {
  const start = text.indexOf(startMarker);
  if (start < 0) return '';
  let end = text.length;
  for (const marker of endMarkers) {
    const idx = text.indexOf(marker, start + startMarker.length);
    if (idx >= 0 && idx < end) end = idx;
  }
  return text.slice(start, end);
}

function extractFirstUsdAfter(text, label, window = 500) {
  const start = text.indexOf(label);
  if (start < 0) return undefined;
  const snippet = text.slice(start, start + window);
  const match = snippet.match(/\$([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return undefined;
  return parseFloat(match[1]);
}

function extractUsdListAfter(text, label, count, window = 300) {
  const start = text.indexOf(label);
  if (start < 0) return [];
  const snippet = text.slice(start, start + window);
  return [...snippet.matchAll(/\$([0-9]+(?:\.[0-9]+)?)/g)]
    .slice(0, count)
    .map((match) => parseFloat(match[1]));
}

function extractNumberAfter(text, label, window = 240) {
  const start = text.indexOf(label);
  if (start < 0) return undefined;
  const snippet = text.slice(start, start + window);
  const match = snippet.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return undefined;
  return parseFloat(match[1]);
}

function extractAllNumbersAfter(text, label, count, window = 600) {
  const start = text.indexOf(label);
  if (start < 0) return [];
  const snippet = text.slice(start, start + window);
  return [...snippet.matchAll(/([0-9]+(?:\.[0-9]+)?)/g)]
    .slice(0, count)
    .map((match) => parseFloat(match[1]));
}

function parseGeminiPricingPage(html) {
  const text = stripHtmlToText(html);
  const sections = [
    ['gemini-2.5-pro', ['gemini-2.5-flash']],
    ['gemini-2.5-flash', ['gemini-2.5-flash-lite']],
    ['gemini-2.5-flash-lite', ['gemini-2.5-flash-lite-preview-09-2025', 'gemini-2.5-flash-native-audio-preview-12-2025', 'gemini-2.0-flash']],
    ['gemini-2.5-flash-lite-preview-09-2025', ['gemini-2.5-flash-native-audio-preview-12-2025', 'gemini-2.0-flash']],
    ['gemini-2.0-flash', ['gemini-2.0-flash-lite']],
    ['gemini-2.0-flash-lite', ['Imagen 4']],
  ];
  const pricing = new Map();
  for (const [modelId, endMarkers] of sections) {
    const section = extractSection(text, modelId, endMarkers);
    if (!section) continue;
    const entry = {
      inputPrice: extractFirstUsdAfter(section, 'Input price'),
      outputPrice: extractFirstUsdAfter(section, 'Output price'),
      cacheReadPrice: extractFirstUsdAfter(section, 'Context caching price'),
    };
    if (Number.isFinite(entry.inputPrice) && Number.isFinite(entry.outputPrice)) {
      pricing.set(modelId, entry);
    }
  }
  return pricing;
}

function parseGrokPricingPage(html) {
  const text = stripHtmlToText(html);
  const rows = [
    'grok-4.3',
    'grok-4.20-multi-agent-0309',
    'grok-4.20-0309-reasoning',
    'grok-4.20-0309-non-reasoning',
    'grok-4-1-fast-reasoning',
    'grok-4-1-fast-non-reasoning',
  ];
  const pricing = new Map();
  for (const modelId of rows) {
    const pattern = new RegExp(`${modelId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+\\d+M\\s+\\$([0-9]+(?:\\.[0-9]+)?)\\s+\\$([0-9]+(?:\\.[0-9]+)?)\\s+\\$([0-9]+(?:\\.[0-9]+)?)`);
    const match = text.match(pattern);
    if (!match) continue;
    pricing.set(modelId, {
      inputPrice: parseFloat(match[1]),
      cacheReadPrice: parseFloat(match[2]),
      outputPrice: parseFloat(match[3]),
    });
  }
  return pricing;
}

function parseDeepSeekPricingPage(html) {
  const text = stripHtmlToText(html);
  const pricing = new Map();
  const cacheHits = extractUsdListAfter(text, '1M INPUT TOKENS (CACHE HIT)', 2);
  const cacheMisses = extractUsdListAfter(text, '1M INPUT TOKENS (CACHE MISS)', 2);
  const outputs = extractUsdListAfter(text, '1M OUTPUT TOKENS', 2);
  if (cacheHits.length >= 2 && cacheMisses.length >= 2 && outputs.length >= 2) {
    pricing.set('deepseek-v4-flash', {
      inputPrice: cacheMisses[0],
      outputPrice: outputs[0],
      cacheReadPrice: cacheHits[0],
    });
    pricing.set('deepseek-v4-pro', {
      inputPrice: cacheMisses[1],
      outputPrice: outputs[1],
      cacheReadPrice: cacheHits[1],
    });
  }
  return pricing;
}

function parseDeepSeekLegacyPricingPage(html) {
  const text = stripHtmlToText(html);
  const pricing = new Map();
  for (const modelId of ['deepseek-chat', 'deepseek-reasoner']) {
    const pattern = new RegExp(`${modelId}\\s+.*?\\$([0-9]+(?:\\.[0-9]+)?)\\s+\\$([0-9]+(?:\\.[0-9]+)?)\\s+\\$([0-9]+(?:\\.[0-9]+)?)`);
    const match = text.match(pattern);
    if (!match) continue;
    pricing.set(modelId, {
      cacheReadPrice: parseFloat(match[1]),
      inputPrice: parseFloat(match[2]),
      outputPrice: parseFloat(match[3]),
    });
  }
  return pricing;
}

function parseKimiHomepagePricing(html) {
  const text = stripHtmlToText(html);
  const rows = [
    ['kimi-k2.6', 'kimi-k2.6'],
    ['kimi-k2.5', 'kimi-k2.5'],
    ['kimi-k2 是一款具备超强代码和 Agent 能力的 MoE 架构基础模型', 'kimi-k2'],
  ];
  const pricing = new Map();
  for (const [needle, modelId] of rows) {
    const start = text.indexOf(needle);
    if (start < 0) continue;
    const snippet = text.slice(start, start + 500);
    const cacheReadPrice = extractNumberAfter(snippet, '缓存命中');
    const inputPrice = extractNumberAfter(snippet, '输入');
    const outputPrice = extractNumberAfter(snippet, '输出');
    if (Number.isFinite(inputPrice) && Number.isFinite(outputPrice)) {
      pricing.set(modelId, { inputPrice, outputPrice, cacheReadPrice });
    }
  }
  return pricing;
}

function parseQwenPricingPage(html) {
  const text = stripHtmlToText(html);
  const rows = [
    ['qwen-turbo', 'qwen-turbo'],
    ['qwen-plus', 'qwen-plus'],
    ['qwen-max', 'qwen-max'],
    ['qwen3-coder-plus', 'qwen3-coder-plus'],
  ];
  const pricing = new Map();
  for (const [needle, modelId] of rows) {
    const start = text.indexOf(needle);
    if (start < 0) continue;
    const snippet = text.slice(start, start + 1200);
    const numbers = [...snippet.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*元/g)].map((match) => parseFloat(match[1]));
    if (numbers.length >= 2) {
      pricing.set(modelId, {
        inputPrice: numbers[0],
        outputPrice: numbers[1],
      });
    }
  }
  return pricing;
}

function parseSiliconFlowPricingPage(html) {
  const text = stripHtmlToText(html);
  const start = text.indexOf('SiliconFlow 平台推理模型价格表');
  if (start < 0) return new Map();
  const section = text.slice(start, start + 1500);
  const rows = [
    ['deepseek-ai/DeepSeek-V3.1-Terminus', 'deepseek-ai/DeepSeek-V3.1-Terminus'],
    ['moonshotai/Kimi-K2-Instruct-0905', 'moonshotai/Kimi-K2-Instruct-0905'],
    ['MiniMaxAI/MiniMax-M2', 'MiniMaxAI/MiniMax-M2'],
    ['Qwen/Qwen3-235B-A22B-Thinking-2507', 'Qwen/Qwen3-235B-A22B-Thinking-2507'],
    ['Qwen/QwQ-32B', 'Qwen/QwQ-32B'],
    ['DeepSeek-V3', 'deepseek-ai/DeepSeek-V3'],
  ];
  const pricing = new Map();
  for (const [needle, modelId] of rows) {
    const pattern = new RegExp(`${needle.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s+¥?([0-9]+(?:\\.[0-9]+)?)\\s+¥?([0-9]+(?:\\.[0-9]+)?)`);
    const match = section.match(pattern);
    if (!match) continue;
    pricing.set(modelId, {
      inputPrice: parseFloat(match[1]),
      outputPrice: parseFloat(match[2]),
    });
  }
  return pricing;
}

async function fetchDynamicPricingMap(provider) {
  if (provider === 'gemini') {
    const resp = await fetch('https://ai.google.dev/gemini-api/docs/pricing');
    if (!resp.ok) throw new Error(`Gemini pricing ${resp.status}`);
    return parseGeminiPricingPage(await resp.text());
  }
  if (provider === 'grok') {
    const resp = await fetch('https://docs.x.ai/developers/pricing');
    if (!resp.ok) throw new Error(`Grok pricing ${resp.status}`);
    return parseGrokPricingPage(await resp.text());
  }
  if (provider === 'deepseek') {
    const [currentResp, legacyResp] = await Promise.all([
      fetch('https://api-docs.deepseek.com/quick_start/pricing'),
      fetch('https://api-docs.deepseek.com/quick_start/pricing-details-usd'),
    ]);
    if (!currentResp.ok) throw new Error(`DeepSeek pricing ${currentResp.status}`);
    if (!legacyResp.ok) throw new Error(`DeepSeek legacy pricing ${legacyResp.status}`);
    const merged = parseDeepSeekPricingPage(await currentResp.text());
    const legacy = parseDeepSeekLegacyPricingPage(await legacyResp.text());
    for (const [modelId, value] of legacy.entries()) merged.set(modelId, value);
    return merged;
  }
  if (provider === 'kimi') {
    const resp = await fetch('https://platform.kimi.com/');
    if (!resp.ok) throw new Error(`Kimi pricing ${resp.status}`);
    return parseKimiHomepagePricing(await resp.text());
  }
  if (provider === 'qwen') {
    const resp = await fetch('https://help.aliyun.com/zh/model-studio/billing-for-model-studio');
    if (!resp.ok) throw new Error(`Qwen pricing ${resp.status}`);
    return parseQwenPricingPage(await resp.text());
  }
  if (provider === 'siliconflow') {
    const resp = await fetch('https://docs.siliconflow.cn/cn/userguide/guides/batch');
    if (!resp.ok) throw new Error(`SiliconFlow pricing ${resp.status}`);
    return parseSiliconFlowPricingPage(await resp.text());
  }
  return new Map();
}

async function getDynamicPricingMap(provider) {
  if (!['gemini', 'grok', 'deepseek', 'kimi', 'qwen', 'siliconflow'].includes(provider)) return new Map();
  const cached = pricingCache.get(provider);
  const now = Date.now();
  if (cached?.data && cached.expiresAt > now) return cached.data;
  if (cached?.promise) return cached.promise;
  const promise = fetchDynamicPricingMap(provider)
    .then((data) => {
      pricingCache.set(provider, { data, expiresAt: Date.now() + PRICING_TTL_MS });
      return data;
    })
    .catch((error) => {
      pricingCache.delete(provider);
      throw error;
    });
  pricingCache.set(provider, { ...cached, promise, expiresAt: 0, data: cached?.data || null });
  return promise;
}

async function resolveModelPricing(provider, modelId) {
  if (!modelId) return null;
  try {
    const dynamicPrices = await getDynamicPricingMap(provider);
    const dynamicMatch = lookupPricingFromMap(dynamicPrices, modelId);
    if (dynamicMatch) return toPricingPayload(dynamicMatch);
  } catch (error) {
    log.warn(`pricing.dynamic_fetch_failed ${formatMeta({ provider, model: modelId, error: error.message })}`);
  }
  return toPricingPayload(getFallbackPricing(modelId));
}

// GET /api/config — 返回当前配置（去掉 api_key）
router.get('/', async (_req, res) => {
  const config = getConfig();
  const logging = getLoggingConfig();
  const safe = stripApiKeys(config);

  const writingProvider = config.writing?.llm?.provider || config.llm?.provider;
  const writingModel = config.writing?.llm?.model || config.llm?.model;

  const [llmPricing, writingPricing] = await Promise.all([
    safe.llm ? resolveModelPricing(config.llm?.provider, config.llm?.model) : Promise.resolve(null),
    safe.writing?.llm ? resolveModelPricing(writingProvider, writingModel) : Promise.resolve(null),
  ]);

  if (safe.llm) safe.llm.model_pricing = llmPricing;
  if (safe.writing?.llm) safe.writing.llm.model_pricing = writingPricing;
  log.debug(`GET /api/config  ${formatMeta({ loggingMode: logging.mode, prompt: logging.prompt?.enabled, llmRaw: logging.llm_raw?.enabled })}`);
  res.json(safe);
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
    // 顶层共享 provider_keys 必须通过专用端点写入，不允许从这里修改
    delete patch.provider_keys;
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
    if (patch.aux_llm) {
      delete patch.aux_llm.api_key;
      delete patch.aux_llm.provider_keys;
      sanitizeBaseUrlPatch(patch.aux_llm);
      applyProviderModelLogic(patch.aux_llm, current.aux_llm);
    }
    if (patch.writing?.llm) {
      delete patch.writing.llm.api_key;
      delete patch.writing.llm.provider_keys;
      sanitizeBaseUrlPatch(patch.writing.llm);
      applyProviderModelLogic(patch.writing.llm, current.writing?.llm);
    }
    if (patch.writing?.aux_llm) {
      delete patch.writing.aux_llm.api_key;
      delete patch.writing.aux_llm.provider_keys;
      sanitizeBaseUrlPatch(patch.writing.aux_llm);
      applyProviderModelLogic(patch.writing.aux_llm, current.writing?.aux_llm);
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

// PUT /api/config/provider-key — 写入指定 provider 的 API Key 到顶层共享池
// 所有对话/写作主副模型 + Embedding 共用同一份 provider_keys
router.put('/provider-key', (req, res) => {
  const { provider, api_key } = req.body || {};
  if (typeof provider !== 'string' || !provider) {
    log.warn(`config.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'provider 必须为非空字符串' })}`);
    return res.status(400).json({ error: 'provider 必须为非空字符串' });
  }
  if (typeof api_key !== 'string') {
    log.warn(`config.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'api_key 必须为字符串' })}`);
    return res.status(400).json({ error: 'api_key 必须为字符串' });
  }
  try {
    updateProviderKey(provider, api_key);
    log.info(`PUT /api/config/provider-key  ${formatMeta({ provider, hasKey: !!api_key })}`);
    res.json({ success: true });
  } catch (err) {
    log.error(`PUT /api/config/provider-key FAIL  ${formatMeta({ error: err.message })}`);
    res.status(500).json({ error: `保存失败：${err.message}` });
  }
});

// ============================================================
// 模型列表拉取 — 公共逻辑
// ============================================================

// 静态价格表，用于无 API 价格返回的 provider（单位 $/1M tokens，来源：各官网公开定价）
const KNOWN_PRICES = new Map([
  // Anthropic
  ['claude-opus-4-5',   { inputPrice: 15,  outputPrice: 75, cacheWritePrice: 18.75, cacheReadPrice: 1.5  }],
  ['claude-sonnet-4-5', { inputPrice: 3,   outputPrice: 15, cacheWritePrice: 3.75,  cacheReadPrice: 0.3  }],
  ['claude-haiku-4-5',  { inputPrice: 0.8, outputPrice: 4,  cacheWritePrice: 1,     cacheReadPrice: 0.08 }],
  ['claude-opus-4-0',   { inputPrice: 15,  outputPrice: 75, cacheWritePrice: 18.75, cacheReadPrice: 1.5  }],
  ['claude-sonnet-4-0', { inputPrice: 3,   outputPrice: 15, cacheWritePrice: 3.75,  cacheReadPrice: 0.3  }],
  // OpenAI
  ['gpt-4o',                { inputPrice: 2.5,   outputPrice: 10    }],
  ['gpt-4o-mini',           { inputPrice: 0.15,  outputPrice: 0.6   }],
  ['gpt-4-turbo',           { inputPrice: 10,    outputPrice: 30    }],
  ['o1',                    { inputPrice: 15,    outputPrice: 60    }],
  ['o1-mini',               { inputPrice: 3,     outputPrice: 12    }],
  ['o3-mini',               { inputPrice: 1.1,   outputPrice: 4.4   }],
  ['o4-mini',               { inputPrice: 1.1,   outputPrice: 4.4   }],
  // DeepSeek
  ['deepseek-chat',         { inputPrice: 0.27,  outputPrice: 1.1   }],
  ['deepseek-reasoner',     { inputPrice: 0.55,  outputPrice: 2.19  }],
  // Gemini
  ['gemini-2.5-pro-preview',        { inputPrice: 1.25,  outputPrice: 10   }],
  ['gemini-2.5-flash-preview',      { inputPrice: 0.15,  outputPrice: 0.6  }],
  ['gemini-2.0-flash',              { inputPrice: 0.1,   outputPrice: 0.4  }],
  ['gemini-2.0-flash-lite',         { inputPrice: 0.075, outputPrice: 0.3  }],
  ['gemini-1.5-pro',                { inputPrice: 1.25,  outputPrice: 5    }],
  ['gemini-1.5-flash',              { inputPrice: 0.075, outputPrice: 0.3  }],
  // Kimi / Moonshot
  ['moonshot-v1-8k',        { inputPrice: 1.6,   outputPrice: 1.6   }],
  ['moonshot-v1-32k',       { inputPrice: 3.2,   outputPrice: 3.2   }],
  ['moonshot-v1-128k',      { inputPrice: 8,     outputPrice: 8     }],
  // GLM
  ['glm-4',                 { inputPrice: 7,     outputPrice: 7     }],
  ['glm-4-flash',           { inputPrice: 0,     outputPrice: 0     }],
  // GLM Coding Plan（按周额度计费，无 token 单价）
  ['GLM-5.1',               { inputPrice: 0,     outputPrice: 0     }],
  ['GLM-5',                 { inputPrice: 0,     outputPrice: 0     }],
  ['GLM-5-Turbo',           { inputPrice: 0,     outputPrice: 0     }],
  ['GLM-4.7',               { inputPrice: 0,     outputPrice: 0     }],
  ['GLM-4.5-Air',           { inputPrice: 0,     outputPrice: 0     }],
  // Kimi Coding Plan（按会员配额计费，无 token 单价）
  ['kimi-for-coding',       { inputPrice: 0,     outputPrice: 0     }],
  // MiniMax Coding Plan（按 Token Plan 配额计费，无 token 单价）
  ['MiniMax-M2.7',          { inputPrice: 0,     outputPrice: 0     }],
  ['MiniMax-M2.7-highspeed',{ inputPrice: 0,     outputPrice: 0     }],
  ['MiniMax-M2.5',          { inputPrice: 0,     outputPrice: 0     }],
  ['MiniMax-M2.5-highspeed',{ inputPrice: 0,     outputPrice: 0     }],
  ['MiniMax-M2.1',          { inputPrice: 0,     outputPrice: 0     }],
  ['MiniMax-M2.1-highspeed',{ inputPrice: 0,     outputPrice: 0     }],
  ['MiniMax-M2',            { inputPrice: 0,     outputPrice: 0     }],
  // SiliconFlow（部分主力模型）
  ['Qwen/Qwen3-235B-A22B',  { inputPrice: 1.26,  outputPrice: 1.26  }],
  ['Qwen/Qwen3-30B-A3B',    { inputPrice: 0.21,  outputPrice: 0.21  }],
  ['deepseek-ai/DeepSeek-V3', { inputPrice: 0.27, outputPrice: 1.1  }],
  // Qwen / Alibaba Cloud Model Studio（价格可能随地区和模型版本变化；未知模型由 API 列表返回但不显示价格）
  ['qwen-turbo',             { inputPrice: 0.05,  outputPrice: 0.2   }],
  ['qwen-plus',              { inputPrice: 0.4,   outputPrice: 1.2   }],
  ['qwen-max',               { inputPrice: 2.4,   outputPrice: 9.6   }],
  ['qwen3-coder-plus',       { inputPrice: 0.6,   outputPrice: 2.4   }],
]);

/**
 * OpenAI-compatible 模型列表拉取（通用）
 * 适用于：OpenAI / OpenRouter / GLM / Kimi / MiniMax / DeepSeek / Grok / SiliconFlow / LM Studio
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
  let dynamicPrices = new Map();
  try {
    dynamicPrices = await getDynamicPricingMap(provider);
  } catch (error) {
    log.warn(`pricing.dynamic_fetch_failed ${formatMeta({ provider, error: error.message })}`);
  }
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

async function fetchModels(provider, apiKey, baseUrl) {
  const staticModels = getStaticCodingPlanModels(provider);
  if (staticModels) return staticModels;

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
    return (data.data || []).map((m) => ({ id: m.id, ...(KNOWN_PRICES.get(m.id) || {}) }));
  }

  // Gemini — 原生接口（暂无价格）
  if (provider === 'gemini') {
    let dynamicPrices = new Map();
    try {
      dynamicPrices = await getDynamicPricingMap(provider);
    } catch (error) {
      log.warn(`pricing.dynamic_fetch_failed ${formatMeta({ provider, error: error.message })}`);
    }
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

async function verifyLlmConnection(config) {
  const llm = {
    ...config.llm,
    api_key: resolveApiKey(config.llm, config.provider_keys || {}),
    base_url: validateModelFetchBaseUrl(config.llm.provider, config.llm.base_url || DEFAULT_BASE_URLS[config.llm.provider] || ''),
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

/**
 * 返回当前 provider 支持的 thinking 级别选项
 * 空数组表示该 provider 不支持 API 级别的 thinking 配置
 * （DeepSeek R1 等模型天然输出 <think> 标签，无需此处配置）
 */
function getThinkingOptions(provider) {
  switch (provider) {
    case 'anthropic':
    case 'gemini':
    case 'kimi-coding':
    case 'minimax-coding':
      return [
        { value: 'budget_low', label: '思考：低（1024 tokens）' },
        { value: 'budget_medium', label: '思考：中（8192 tokens）' },
        { value: 'budget_high', label: '思考：高（16384 tokens）' },
      ];
    case 'openai':
    case 'glm-coding':
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
  const apiKey = getProviderKey(provider);
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

// GET /api/config/writing/models — 拉取写作主模型列表
router.get('/writing/models', async (_req, res) => {
  const writingConfig = getWritingLlmConfig();
  const { provider, base_url } = writingConfig;
  const apiKey = writingConfig.api_key;
  try {
    const models = await fetchModels(provider, apiKey, base_url);
    const thinkingOptions = getThinkingOptions(provider);
    log.info(`GET /api/config/writing/models  ${formatMeta({ provider, count: models.length, thinkingOptions: thinkingOptions.length })}`);
    res.json({ models, thinkingOptions });
  } catch (err) {
    log.warn(`GET /api/config/writing/models FAIL  ${formatMeta({ provider, error: err.message })}`);
    res.status(502).json({ error: '无法获取模型列表，请检查 API Key 和网络连接' });
  }
});

// GET /api/config/writing-aux/models — 拉取写作副模型列表
router.get('/writing-aux/models', async (_req, res) => {
  const auxConfig = getWritingAuxLlmConfig();
  const { provider, base_url } = auxConfig;
  const apiKey = auxConfig.api_key;
  try {
    const models = await fetchModels(provider, apiKey, base_url);
    const thinkingOptions = getThinkingOptions(provider);
    log.info(`GET /api/config/writing-aux/models  ${formatMeta({ provider, count: models.length, thinkingOptions: thinkingOptions.length })}`);
    res.json({ models, thinkingOptions });
  } catch (err) {
    log.warn(`GET /api/config/writing-aux/models FAIL  ${formatMeta({ provider, error: err.message })}`);
    res.status(502).json({ error: '无法获取模型列表，请检查 API Key 和网络连接' });
  }
});

// GET /api/config/aux/models — 拉取副模型列表
router.get('/aux/models', async (_req, res) => {
  const config = getConfig();
  const auxConfig = getAuxLlmConfig();
  const { provider, base_url } = auxConfig;
  const apiKey = auxConfig.api_key;
  try {
    const models = await fetchModels(provider, apiKey, base_url);
    const thinkingOptions = getThinkingOptions(provider);
    log.info(`GET /api/config/aux/models  ${formatMeta({ provider, count: models.length, thinkingOptions: thinkingOptions.length })}`);
    res.json({ models, thinkingOptions });
  } catch (err) {
    log.warn(`GET /api/config/aux/models FAIL  ${formatMeta({ provider, error: err.message })}`);
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
  const apiKey = getProviderKey(provider);
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
  try {
    await verifyLlmConnection(config);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// GET /api/config/writing/test-connection — 验证写作主模型 LLM 连通性
router.get('/writing/test-connection', async (_req, res) => {
  const writingConfig = getWritingLlmConfig();
  try {
    const testConfig = {
      provider_keys: { [writingConfig.provider]: writingConfig.api_key },
      llm: {
        provider: writingConfig.provider,
        base_url: writingConfig.base_url || '',
        model: writingConfig.model || '',
        max_tokens: 8,
        temperature: 0,
      },
    };
    await verifyLlmConnection(testConfig);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// GET /api/config/writing-aux/test-connection — 验证写作副模型 LLM 连通性
router.get('/writing-aux/test-connection', async (_req, res) => {
  const auxConfig = getWritingAuxLlmConfig();
  try {
    const testConfig = {
      provider_keys: { [auxConfig.provider]: auxConfig.api_key },
      llm: {
        provider: auxConfig.provider,
        base_url: auxConfig.base_url || '',
        model: auxConfig.model || '',
        max_tokens: 8,
        temperature: 0,
      },
    };
    await verifyLlmConnection(testConfig);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// GET /api/config/aux/test-connection — 验证副模型 LLM 连通性
router.get('/aux/test-connection', async (_req, res) => {
  const config = getConfig();
  const auxConfig = getAuxLlmConfig();
  try {
    const testConfig = {
      provider_keys: { [auxConfig.provider]: auxConfig.api_key },
      llm: {
        provider: auxConfig.provider,
        base_url: auxConfig.base_url || '',
        model: auxConfig.model || '',
        max_tokens: 8,
        temperature: 0,
      },
    };
    await verifyLlmConnection(testConfig);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

export default router;
