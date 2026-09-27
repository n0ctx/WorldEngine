/**
 * model-pricing-parsers.js — 各 provider 定价页面/文档抓取后的文本解析器
 *
 * 只负责把 fetch 到的 HTML/Markdown 文本解析成 { modelId => pricing } 的 Map，
 * 不做网络请求，供 services/model-pricing.js 调用。
 */

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

export function parseGeminiPricingPage(html) {
  const text = stripHtmlToText(html);
  const sections = [
    // Gemini 3.x preview 系列在页面中位于 2.5 之前；end markers 指向下一个出现的小节标题。
    ['gemini-3.1-pro-preview', ['gemini-3.1-flash-lite-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro']],
    ['gemini-3.1-flash-lite-preview', ['gemini-3.1-flash-live-preview', 'gemini-3.1-flash-image-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro']],
    ['gemini-3-flash-preview', ['gemini-3-pro-image-preview', 'gemini-2.5-pro']],
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

export function parseGrokPricingPage(html) {
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

export function parseDeepSeekPricingPage(html) {
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

export function parseDeepSeekLegacyPricingPage(html) {
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

export function parseKimiHomepagePricing(html) {
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

export function parseQwenPricingPage(html) {
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

export function parseAnthropicPricingMarkdown(text) {
  // 表行示例:
  // | Claude Opus 4.5   | $5 / MTok | $6.25 / MTok | $10 / MTok | $0.50 / MTok | $25 / MTok |
  const pricing = new Map();
  const rowRe = /\|\s*(Claude\s+[A-Za-z0-9.\- ]+?)(?:\s*\(\[?[^\]\n]*\]?[^)]*\))?\s*\|\s*\$([0-9.]+)\s*\/\s*MTok\s*\|\s*\$([0-9.]+)\s*\/\s*MTok\s*\|\s*\$([0-9.]+)\s*\/\s*MTok\s*\|\s*\$([0-9.]+)\s*\/\s*MTok\s*\|\s*\$([0-9.]+)\s*\/\s*MTok\s*\|/g;
  const nameToId = (name) => {
    const m = name.trim().match(/^Claude\s+(Opus|Sonnet|Haiku)\s+([0-9]+(?:\.[0-9]+)?)$/i);
    if (!m) return null;
    const family = m[1].toLowerCase();
    // 整数版本(如 Claude Sonnet 4)对应 API id `claude-sonnet-4-<date>`,不加 `-0`
    const ver = m[2].includes('.') ? m[2].replace('.', '-') : m[2];
    return `claude-${family}-${ver}`;
  };
  let match;
  while ((match = rowRe.exec(text)) !== null) {
    const modelId = nameToId(match[1]);
    if (!modelId) continue;
    // 取 5m Cache Writes 作为 cacheWritePrice(Anthropic 默认/最常用的 5 分钟缓存)
    pricing.set(modelId, {
      inputPrice: parseFloat(match[2]),
      cacheWritePrice: parseFloat(match[3]),
      cacheReadPrice: parseFloat(match[5]),
      outputPrice: parseFloat(match[6]),
    });
  }
  return pricing;
}

export function parseOpenAIPricingMarkdown(text) {
  // OpenAI docs.md 内含 JS 数组字面量:["model_id", input, cachedInput, output]
  // 第一组表是 Standard 定价,后续表为 Batch/Flex,以 Standard 为准(取第一次出现)。
  const pricing = new Map();
  const rowRe = /\[\s*"([a-z0-9._-]+)(?:\s*\([^)]*\))?"\s*,\s*([0-9.]+)\s*,\s*(?:null|"-"|""|([0-9.]+))\s*,\s*([0-9.]+)\s*\]/g;
  let match;
  while ((match = rowRe.exec(text)) !== null) {
    const id = match[1];
    if (pricing.has(id)) continue;
    const entry = {
      inputPrice: parseFloat(match[2]),
      outputPrice: parseFloat(match[4]),
    };
    if (match[3] != null) entry.cacheReadPrice = parseFloat(match[3]);
    pricing.set(id, entry);
  }
  return pricing;
}

export function parseGlmPricingMarkdown(text) {
  // | GLM-5.1 | \$1.4 | \$0.26 | Limited-time Free | \$4.4 |
  const pricing = new Map();
  const rowRe = /\|\s*(GLM-[A-Za-z0-9.-]+)\s*\|\s*\\?\$([0-9.]+)\s*\|\s*\\?\$([0-9.]+)\s*\|[^|]*\|\s*\\?\$([0-9.]+)\s*\|/g;
  let match;
  while ((match = rowRe.exec(text)) !== null) {
    pricing.set(match[1], {
      inputPrice: parseFloat(match[2]),
      cacheReadPrice: parseFloat(match[3]),
      outputPrice: parseFloat(match[4]),
    });
  }
  return pricing;
}

export function parseMiniMaxPricingMarkdown(text) {
  // | **MiniMax-M2.7** | 2.1 | 8.4 | 0.42 | 2.625 |  (CNY/M tokens — 与现有 qwen 解析器同口径,原值直存)
  const pricing = new Map();
  const rowRe = /\|\s*\*?\*?\s*(MiniMax-[A-Za-z0-9.-]+)\s*\*?\*?\s*\|\s*([0-9.]+)\s*\|\s*([0-9.]+)\s*\|\s*([0-9.—-]+)\s*\|\s*([0-9.—-]+)\s*\|/g;
  let match;
  while ((match = rowRe.exec(text)) !== null) {
    const entry = {
      inputPrice: parseFloat(match[2]),
      outputPrice: parseFloat(match[3]),
    };
    const cacheRead = parseFloat(match[4]);
    const cacheWrite = parseFloat(match[5]);
    if (Number.isFinite(cacheRead)) entry.cacheReadPrice = cacheRead;
    if (Number.isFinite(cacheWrite)) entry.cacheWritePrice = cacheWrite;
    pricing.set(match[1], entry);
  }
  return pricing;
}

export function parseSiliconFlowPricingPage(html) {
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
