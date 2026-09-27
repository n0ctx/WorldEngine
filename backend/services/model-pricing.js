/**
 * model-pricing.js — LLM 模型定价：动态抓取各官网价格 + 静态兜底价表
 *
 * 动态价格按 provider 缓存（TTL 见 PRICING_TTL_MS），抓取失败时回退到 KNOWN_PRICES。
 */

import { createLogger, formatMeta } from '../utils/logger.js';
import {
  parseGeminiPricingPage,
  parseGrokPricingPage,
  parseDeepSeekPricingPage,
  parseDeepSeekLegacyPricingPage,
  parseKimiHomepagePricing,
  parseQwenPricingPage,
  parseAnthropicPricingMarkdown,
  parseOpenAIPricingMarkdown,
  parseGlmPricingMarkdown,
  parseMiniMaxPricingMarkdown,
  parseSiliconFlowPricingPage,
} from './model-pricing-parsers.js';

const log = createLogger('config', 'blue');
const PRICING_TTL_MS = 6 * 60 * 60 * 1000;
const pricingCache = new Map();

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
  // Gemini 3.x — preview id 直接命中；stable id 共享 preview 价格作为兜底
  ['gemini-3.1-pro-preview', 'gemini-3.1-pro-preview'],
  ['gemini-3.1-pro', 'gemini-3.1-pro-preview'],
  ['gemini-3-pro-preview', 'gemini-3.1-pro-preview'],
  ['gemini-3-pro', 'gemini-3.1-pro-preview'],
  ['gemini-3.1-flash-lite-preview', 'gemini-3.1-flash-lite-preview'],
  ['gemini-3.1-flash-lite', 'gemini-3.1-flash-lite-preview'],
  ['gemini-3-flash-preview', 'gemini-3-flash-preview'],
  ['gemini-3.1-flash', 'gemini-3-flash-preview'],
  ['gemini-3-flash', 'gemini-3-flash-preview'],
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
  // Anthropic — 真实 API id 含日期后缀,startsWith 命中规范化键
  ['claude-opus-4-7', 'claude-opus-4-7'],
  ['claude-opus-4-6', 'claude-opus-4-6'],
  ['claude-opus-4-5', 'claude-opus-4-5'],
  ['claude-opus-4-1', 'claude-opus-4-1'],
  ['claude-opus-4', 'claude-opus-4'],
  ['claude-sonnet-4-6', 'claude-sonnet-4-6'],
  ['claude-sonnet-4-5', 'claude-sonnet-4-5'],
  ['claude-sonnet-4', 'claude-sonnet-4'],
  ['claude-haiku-4-5', 'claude-haiku-4-5'],
  ['claude-3-5-haiku', 'claude-haiku-3-5'],
  // OpenAI — gpt-4o-2024-XX-XX 等真实 id 通过 startsWith 命中
  ['gpt-5-pro', 'gpt-5-pro'],
  ['gpt-5-mini', 'gpt-5-mini'],
  ['gpt-5-nano', 'gpt-5-nano'],
  ['gpt-5', 'gpt-5'],
  ['gpt-4.1-mini', 'gpt-4.1-mini'],
  ['gpt-4.1-nano', 'gpt-4.1-nano'],
  ['gpt-4.1', 'gpt-4.1'],
  ['gpt-4o-mini', 'gpt-4o-mini'],
  ['gpt-4o', 'gpt-4o'],
  ['o4-mini', 'o4-mini'],
  ['o3-mini', 'o3-mini'],
  ['o3-pro', 'o3-pro'],
  ['o3', 'o3'],
  ['o1-mini', 'o1-mini'],
  ['o1-pro', 'o1-pro'],
  ['o1', 'o1'],
  // GLM — z.ai 模型名带大小写,API 返回的也是相同写法
  ['GLM-5.1', 'GLM-5.1'],
  ['GLM-5-Turbo', 'GLM-5-Turbo'],
  ['GLM-5', 'GLM-5'],
  ['GLM-4.7', 'GLM-4.7'],
  ['GLM-4.5-Air', 'GLM-4.5-Air'],
];

export function lookupPricingFromMap(pricingMap, modelId) {
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

export function getFallbackPricing(modelId) {
  return lookupPricingFromMap(KNOWN_PRICES, modelId);
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
  if (provider === 'anthropic') {
    const resp = await fetch('https://docs.anthropic.com/en/docs/about-claude/pricing.md');
    if (!resp.ok) throw new Error(`Anthropic pricing ${resp.status}`);
    return parseAnthropicPricingMarkdown(await resp.text());
  }
  if (provider === 'openai') {
    const resp = await fetch('https://platform.openai.com/docs/pricing.md');
    if (!resp.ok) throw new Error(`OpenAI pricing ${resp.status}`);
    return parseOpenAIPricingMarkdown(await resp.text());
  }
  if (provider === 'glm') {
    const resp = await fetch('https://docs.z.ai/guides/overview/pricing.md');
    if (!resp.ok) throw new Error(`GLM pricing ${resp.status}`);
    return parseGlmPricingMarkdown(await resp.text());
  }
  if (provider === 'minimax') {
    const resp = await fetch('https://platform.minimaxi.com/docs/guides/pricing-paygo.md');
    if (!resp.ok) throw new Error(`MiniMax pricing ${resp.status}`);
    return parseMiniMaxPricingMarkdown(await resp.text());
  }
  return new Map();
}

/** 取动态价格表；抓取失败时记 warn（按 logProvider 记录）并返回空表 */
export async function getDynamicPricingOrEmpty(pricingProvider, logProvider = pricingProvider) {
  try {
    return await getDynamicPricingMap(pricingProvider);
  } catch (error) {
    log.warn(`pricing.dynamic_fetch_failed ${formatMeta({ provider: logProvider, error: error.message })}`);
    return new Map();
  }
}

async function getDynamicPricingMap(provider) {
  if (!['gemini', 'grok', 'deepseek', 'kimi', 'qwen', 'siliconflow', 'anthropic', 'openai', 'glm', 'minimax'].includes(provider)) return new Map();
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

export async function resolveModelPricing(provider, modelId) {
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

// 静态价格表，用于无 API 价格返回的 provider（单位 $/1M tokens，来源：各官网公开定价）
export const KNOWN_PRICES = new Map([
  // Anthropic
  ['claude-opus-4-5',   { inputPrice: 15,  outputPrice: 75, cacheWritePrice: 18.75, cacheReadPrice: 1.5  }],
  ['claude-sonnet-4-5', { inputPrice: 3,   outputPrice: 15, cacheWritePrice: 3.75,  cacheReadPrice: 0.3  }],
  ['claude-haiku-4-5',  { inputPrice: 0.8, outputPrice: 4,  cacheWritePrice: 1,     cacheReadPrice: 0.08 }],
  ['claude-opus-4',     { inputPrice: 15,  outputPrice: 75, cacheWritePrice: 18.75, cacheReadPrice: 1.5  }],
  ['claude-sonnet-4',   { inputPrice: 3,   outputPrice: 15, cacheWritePrice: 3.75,  cacheReadPrice: 0.3  }],
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
  // Gemini 3.x（以 ≤200k tier 为基准；>200k 的更高单价由 API 实测覆盖）
  ['gemini-3.1-pro-preview',        { inputPrice: 2,     outputPrice: 12,  cacheReadPrice: 0.2  }],
  ['gemini-3.1-flash-lite-preview', { inputPrice: 0.25,  outputPrice: 1.5, cacheReadPrice: 0.025 }],
  ['gemini-3-flash-preview',        { inputPrice: 0.5,   outputPrice: 3,   cacheReadPrice: 0.05  }],
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

export function toPrice1M(perToken) {
  const n = parseFloat(perToken);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const v = n * 1_000_000;
  return Math.round(v * 100) / 100;
}
