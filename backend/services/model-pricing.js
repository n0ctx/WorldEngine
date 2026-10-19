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
  parseKimiPricingMarkdown,
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
  ['gemini-3.1-flash-lite', 'gemini-3.1-flash-lite'],
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
  ['deepseek-v4-flash', 'deepseek-flash'],
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
    const resp = await fetch('https://ai.google.dev/gemini-api/docs/pricing?hl=en');
    if (!resp.ok) throw new Error(`Gemini pricing ${resp.status}`);
    return parseGeminiPricingPage(await resp.text());
  }
  if (provider === 'grok') {
    const resp = await fetch('https://docs.x.ai/developers/pricing');
    if (!resp.ok) throw new Error(`Grok pricing ${resp.status}`);
    return parseGrokPricingPage(await resp.text());
  }
  if (provider === 'deepseek') {
    const resp = await fetch('https://api-docs.deepseek.com/quick_start/pricing/');
    if (!resp.ok) throw new Error(`DeepSeek pricing ${resp.status}`);
    return parseDeepSeekPricingPage(await resp.text());
  }
  if (provider === 'kimi') {
    const resp = await fetch('https://platform.kimi.com/docs/pricing/chat.md');
    if (!resp.ok) throw new Error(`Kimi pricing ${resp.status}`);
    return parseKimiPricingMarkdown(await resp.text());
  }
  if (provider === 'qwen') {
    const resp = await fetch('https://help.aliyun.com/zh/model-studio/model-pricing');
    if (!resp.ok) throw new Error(`Qwen pricing ${resp.status}`);
    return parseQwenPricingPage(await resp.text());
  }
  if (provider === 'siliconflow') {
    const resp = await fetch('https://www.siliconflow.cn/pricing');
    if (!resp.ok) throw new Error(`SiliconFlow pricing ${resp.status}`);
    return parseSiliconFlowPricingPage(await resp.text());
  }
  if (provider === 'anthropic') {
    const resp = await fetch('https://platform.claude.com/docs/en/about-claude/pricing.md');
    if (!resp.ok) throw new Error(`Anthropic pricing ${resp.status}`);
    return parseAnthropicPricingMarkdown(await resp.text());
  }
  if (provider === 'openai') {
    const resp = await fetch('https://developers.openai.com/api/docs/pricing.md');
    if (!resp.ok) throw new Error(`OpenAI pricing ${resp.status}`);
    return parseOpenAIPricingMarkdown(await resp.text());
  }
  if (provider === 'glm') {
    const resp = await fetch('https://docs.z.ai/guides/overview/pricing.md');
    if (!resp.ok) throw new Error(`GLM pricing ${resp.status}`);
    return parseGlmPricingMarkdown(await resp.text());
  }
  if (provider === 'minimax') {
    const resp = await fetch('https://platform.minimax.cn/docs/guides/pricing-paygo.md');
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

// 静态价格表，用于无 API 价格返回的 provider（每 1M tokens，来源：各官网公开定价，2026-10 核对）
// 币种与该 provider 动态抓取的官网价同口径：Kimi、Qwen、SiliconFlow 为人民币，其余为美元
export const KNOWN_PRICES = new Map([
  // Anthropic
  ['claude-fable-5-1',  { inputPrice: 10,  outputPrice: 50, cacheWritePrice: 12.5,  cacheReadPrice: 0.25 }],
  ['claude-fable-5',    { inputPrice: 10,  outputPrice: 50, cacheWritePrice: 12.5,  cacheReadPrice: 1    }],
  ['claude-opus-5-5',   { inputPrice: 4,   outputPrice: 20, cacheWritePrice: 5,     cacheReadPrice: 0.2  }],
  ['claude-opus-5',     { inputPrice: 5,   outputPrice: 25, cacheWritePrice: 6.25,  cacheReadPrice: 0.5  }],
  ['claude-opus-4-8',   { inputPrice: 5,   outputPrice: 25, cacheWritePrice: 6.25,  cacheReadPrice: 0.5  }],
  ['claude-opus-4-7',   { inputPrice: 5,   outputPrice: 25, cacheWritePrice: 6.25,  cacheReadPrice: 0.5  }],
  ['claude-opus-4-6',   { inputPrice: 5,   outputPrice: 25, cacheWritePrice: 6.25,  cacheReadPrice: 0.5  }],
  ['claude-opus-4-5',   { inputPrice: 5,   outputPrice: 25, cacheWritePrice: 6.25,  cacheReadPrice: 0.5  }],
  ['claude-sonnet-5-5', { inputPrice: 2,   outputPrice: 10, cacheWritePrice: 2.5,   cacheReadPrice: 0.1  }],
  ['claude-sonnet-5',   { inputPrice: 2,   outputPrice: 10, cacheWritePrice: 2.5,   cacheReadPrice: 0.2  }],
  ['claude-sonnet-4-6', { inputPrice: 3,   outputPrice: 15, cacheWritePrice: 3.75,  cacheReadPrice: 0.3  }],
  ['claude-sonnet-4-5', { inputPrice: 3,   outputPrice: 15, cacheWritePrice: 3.75,  cacheReadPrice: 0.3  }],
  // Haiku 5.5 取 ≤100k 提示档；更长的提示由动态价格覆盖
  ['claude-haiku-5-5',  { inputPrice: 0.1, outputPrice: 0.5, cacheWritePrice: 0.125, cacheReadPrice: 0.01 }],
  ['claude-haiku-4-5',  { inputPrice: 1,   outputPrice: 5,  cacheWritePrice: 1.25,  cacheReadPrice: 0.1  }],
  // OpenAI（≤272K 档）
  ['gpt-6-astra',           { inputPrice: 10,    outputPrice: 50,   cacheWritePrice: 12.5,  cacheReadPrice: 1     }],
  ['gpt-6.1-sol',           { inputPrice: 2,     outputPrice: 10,   cacheWritePrice: 2.5,   cacheReadPrice: 0.1   }],
  ['gpt-6-sol',             { inputPrice: 2,     outputPrice: 10,   cacheWritePrice: 2.5,   cacheReadPrice: 0.2   }],
  ['gpt-6-luna',            { inputPrice: 0.1,   outputPrice: 0.5,  cacheWritePrice: 0.125, cacheReadPrice: 0.01  }],
  // gpt-5.6-sol 为限时价，至少到 2026-11-21
  ['gpt-5.6-sol',           { inputPrice: 4,     outputPrice: 20,   cacheWritePrice: 5,     cacheReadPrice: 0.4   }],
  ['gpt-5.6-terra',         { inputPrice: 2,     outputPrice: 12,   cacheWritePrice: 2.5,   cacheReadPrice: 0.2   }],
  ['gpt-5.6-luna',          { inputPrice: 0.2,   outputPrice: 1.2,  cacheWritePrice: 0.25,  cacheReadPrice: 0.02  }],
  ['gpt-5.5',               { inputPrice: 5,     outputPrice: 30,   cacheReadPrice: 0.5   }],
  ['gpt-5.5-pro',           { inputPrice: 30,    outputPrice: 180  }],
  ['gpt-5.4',               { inputPrice: 2.5,   outputPrice: 15,   cacheReadPrice: 0.25  }],
  ['gpt-5.4-mini',          { inputPrice: 0.75,  outputPrice: 4.5,  cacheReadPrice: 0.075 }],
  ['gpt-5.4-nano',          { inputPrice: 0.2,   outputPrice: 1.25, cacheReadPrice: 0.02  }],
  ['gpt-5.4-pro',           { inputPrice: 30,    outputPrice: 180  }],
  ['gpt-5.2',               { inputPrice: 1.75,  outputPrice: 14,   cacheReadPrice: 0.175 }],
  ['gpt-5.1',               { inputPrice: 1.25,  outputPrice: 10,   cacheReadPrice: 0.125 }],
  ['gpt-5',                 { inputPrice: 1.25,  outputPrice: 10,   cacheReadPrice: 0.125 }],
  ['gpt-5-mini',            { inputPrice: 0.25,  outputPrice: 2,    cacheReadPrice: 0.025 }],
  ['gpt-5-nano',            { inputPrice: 0.05,  outputPrice: 0.4,  cacheReadPrice: 0.005 }],
  ['gpt-5-pro',             { inputPrice: 15,    outputPrice: 120  }],
  ['gpt-4.1',               { inputPrice: 2,     outputPrice: 8,    cacheReadPrice: 0.5   }],
  ['gpt-4.1-mini',          { inputPrice: 0.4,   outputPrice: 1.6,  cacheReadPrice: 0.1   }],
  ['gpt-4.1-nano',          { inputPrice: 0.1,   outputPrice: 0.4,  cacheReadPrice: 0.025 }],
  ['gpt-4o',                { inputPrice: 2.5,   outputPrice: 10,   cacheReadPrice: 1.25  }],
  ['gpt-4o-mini',           { inputPrice: 0.15,  outputPrice: 0.6,  cacheReadPrice: 0.075 }],
  ['o1',                    { inputPrice: 15,    outputPrice: 60,   cacheReadPrice: 7.5   }],
  ['o1-pro',                { inputPrice: 150,   outputPrice: 600  }],
  ['o3',                    { inputPrice: 2,     outputPrice: 8,    cacheReadPrice: 0.5   }],
  ['o3-pro',                { inputPrice: 20,    outputPrice: 80   }],
  ['o3-mini',               { inputPrice: 1.1,   outputPrice: 4.4,  cacheReadPrice: 0.55  }],
  ['o4-mini',               { inputPrice: 1.1,   outputPrice: 4.4,  cacheReadPrice: 0.275 }],
  // xAI（<200k 档）
  ['grok-4.7',                     { inputPrice: 2,    outputPrice: 6,   cacheReadPrice: 0.5 }],
  ['grok-4.6',                     { inputPrice: 2,    outputPrice: 6,   cacheReadPrice: 0.5 }],
  ['grok-4.5',                     { inputPrice: 2,    outputPrice: 6,   cacheReadPrice: 0.3 }],
  ['grok-build-0.1',               { inputPrice: 1,    outputPrice: 2,   cacheReadPrice: 0.2 }],
  ['grok-4.3',                     { inputPrice: 1.25, outputPrice: 2.5, cacheReadPrice: 0.2 }],
  ['grok-4.20-0309-reasoning',     { inputPrice: 1.25, outputPrice: 2.5, cacheReadPrice: 0.2 }],
  ['grok-4.20-0309-non-reasoning', { inputPrice: 1.25, outputPrice: 2.5, cacheReadPrice: 0.2 }],
  ['grok-4.20-multi-agent-0309',   { inputPrice: 1.25, outputPrice: 2.5, cacheReadPrice: 0.2 }],
  // DeepSeek（闲时价；工作日高峰时段翻倍）
  ['deepseek-flash',        { inputPrice: 0.15,  outputPrice: 0.6,  cacheReadPrice: 0.003 }],
  ['deepseek-v4-pro',       { inputPrice: 0.66,  outputPrice: 1.98, cacheReadPrice: 0.022 }],
  // Gemini（≤200k 档；>200k 的更高单价由 API 实测覆盖）
  // gemini-4-argon 限时价至 2026-11-30，3.8 / 3.6 Flash 限时价至 2026-12-31
  ['gemini-4-argon',         { inputPrice: 2,    outputPrice: 10,   cacheReadPrice: 0.1   }],
  ['gemini-3.8-flash',       { inputPrice: 0.75, outputPrice: 3.75, cacheReadPrice: 0.075 }],
  ['gemini-3.6-flash',       { inputPrice: 0.75, outputPrice: 3.75, cacheReadPrice: 0.075 }],
  ['gemini-3.5-flash-lite',  { inputPrice: 0.3,  outputPrice: 2.5,  cacheReadPrice: 0.03  }],
  ['gemini-3.1-flash-lite',  { inputPrice: 0.25, outputPrice: 1.5,  cacheReadPrice: 0.025 }],
  ['gemini-3.1-pro-preview', { inputPrice: 2,    outputPrice: 12,   cacheReadPrice: 0.2   }],
  ['gemini-3-flash-preview', { inputPrice: 0.5,  outputPrice: 3,    cacheReadPrice: 0.05  }],
  ['gemini-2.5-pro',         { inputPrice: 1.25, outputPrice: 10,   cacheReadPrice: 0.125 }],
  ['gemini-2.5-flash',       { inputPrice: 0.3,  outputPrice: 2.5,  cacheReadPrice: 0.03  }],
  ['gemini-2.5-flash-lite',  { inputPrice: 0.1,  outputPrice: 0.4,  cacheReadPrice: 0.01  }],
  // Kimi / Moonshot（人民币）
  ['kimi-k3',                  { inputPrice: 20,  outputPrice: 100 }],
  ['kimi-k2.7-code',           { inputPrice: 6.5, outputPrice: 27  }],
  ['kimi-k2.7-code-highspeed', { inputPrice: 13,  outputPrice: 54  }],
  ['kimi-k2.6',                { inputPrice: 6.5, outputPrice: 27  }],
  // GLM
  ['GLM-5.3',               { inputPrice: 1.4,   outputPrice: 4.4   }],
  ['GLM-5.3-FlashX',        { inputPrice: 0.37,  outputPrice: 1.25  }],
  ['GLM-5.3-Flash',         { inputPrice: 0.15,  outputPrice: 0.5   }],
  ['GLM-5.2',               { inputPrice: 1.4,   outputPrice: 4.4   }],
  ['GLM-5.1',               { inputPrice: 1.4,   outputPrice: 4.4   }],
  ['GLM-5',                 { inputPrice: 1,     outputPrice: 3.2   }],
  ['GLM-4.7',               { inputPrice: 0.6,   outputPrice: 2.2   }],
  ['GLM-4.7-Flash',         { inputPrice: 0,     outputPrice: 0     }],
  ['GLM-4.5-Air',           { inputPrice: 0.2,   outputPrice: 1.1   }],
  // Kimi Coding Plan（按会员配额计费，无 token 单价）
  ['k3',                        { inputPrice: 0, outputPrice: 0 }],
  ['k3-256k',                   { inputPrice: 0, outputPrice: 0 }],
  ['kimi-for-coding',           { inputPrice: 0, outputPrice: 0 }],
  ['kimi-for-coding-highspeed', { inputPrice: 0, outputPrice: 0 }],
  // MiniMax Coding Plan（按 M Plan / Token Plan 配额计费，无 token 单价）
  ['MiniMax-M3.1-Flash',    { inputPrice: 0,     outputPrice: 0     }],
  ['MiniMax-M3',            { inputPrice: 0,     outputPrice: 0     }],
  ['MiniMax-M2.7',          { inputPrice: 0,     outputPrice: 0     }],
  ['MiniMax-M2.7-highspeed',{ inputPrice: 0,     outputPrice: 0     }],
  ['MiniMax-M2.5',          { inputPrice: 0,     outputPrice: 0     }],
  ['MiniMax-M2.5-highspeed',{ inputPrice: 0,     outputPrice: 0     }],
  ['MiniMax-M2.1',          { inputPrice: 0,     outputPrice: 0     }],
  ['MiniMax-M2.1-highspeed',{ inputPrice: 0,     outputPrice: 0     }],
  ['MiniMax-M2',            { inputPrice: 0,     outputPrice: 0     }],
  // SiliconFlow（人民币，部分主力模型；Qwen3.5 取 ≤128k 档）
  ['deepseek-ai/DeepSeek-V3.2',          { inputPrice: 4,   outputPrice: 6,    cacheReadPrice: 0.4 }],
  ['deepseek-ai/DeepSeek-V3.1-Terminus', { inputPrice: 4,   outputPrice: 12,   cacheReadPrice: 0.4 }],
  ['Qwen/Qwen3.6-35B-A3B',               { inputPrice: 1.8, outputPrice: 10.8 }],
  ['Qwen/Qwen3.6-27B',                   { inputPrice: 3,   outputPrice: 18   }],
  ['Qwen/Qwen3.5-122B-A10B',             { inputPrice: 0.8, outputPrice: 6.4  }],
  ['Qwen/Qwen3.5-35B-A3B',               { inputPrice: 0.4, outputPrice: 3.2  }],
  ['Qwen/Qwen3.5-27B',                   { inputPrice: 0.6, outputPrice: 4.8  }],
  // Qwen / 阿里云百炼（人民币，北京地域；阶梯计价取最低档，未知模型由 API 列表返回但不显示价格）
  ['qwen3.8-max',            { inputPrice: 12,    outputPrice: 36    }],
  ['qwen3.7-max',            { inputPrice: 12,    outputPrice: 36    }],
  ['qwen3.7-plus',           { inputPrice: 2,     outputPrice: 8     }],
  ['qwen3.8-flash',          { inputPrice: 0.8,   outputPrice: 2.7   }],
  ['qwen3.7-flash',          { inputPrice: 0.2,   outputPrice: 0.8   }],
  ['qwen-max',               { inputPrice: 2.4,   outputPrice: 9.6   }],
  ['qwen-plus',              { inputPrice: 0.8,   outputPrice: 2     }],
  ['qwen-flash',             { inputPrice: 0.15,  outputPrice: 1.5   }],
]);

export function toPrice1M(perToken) {
  const n = parseFloat(perToken);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const v = n * 1_000_000;
  return Math.round(v * 100) / 100;
}
