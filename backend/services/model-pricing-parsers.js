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

// 逐行匹配价格表(match[1] 为模型 id),同一模型只取首行即标准档
function collectFirstRows(text, rowRe, toEntry) {
  const pricing = new Map();
  for (const match of text.matchAll(rowRe)) {
    if (!pricing.has(match[1])) pricing.set(match[1], toEntry(match));
  }
  return pricing;
}

// match[2..4] 依次为 输入 / 缓存命中 / 输出
const inputCachedOutput = (match) => ({
  inputPrice: parseFloat(match[2]),
  cacheReadPrice: parseFloat(match[3]),
  outputPrice: parseFloat(match[4]),
});

const GEMINI_MODEL_ID = 'gemini-[a-z0-9]+(?:[.-][a-z0-9]+)*';

export function parseGeminiPricingPage(html) {
  const text = stripHtmlToText(html);
  // 每个模型小节从 id 起(标题可写成 "A and B"),到下一个 id 为止;
  // 只收文本模型(输出价带 thinking 标注),小节内首个价格即 Standard 档 ≤200k 的当前价
  const headerRe = new RegExp(`(${GEMINI_MODEL_ID})((?:\\s+and\\s+${GEMINI_MODEL_ID})*)`, 'g');
  const headers = [...text.matchAll(headerRe)];
  const pricing = new Map();
  headers.forEach((header, i) => {
    const section = text.slice(header.index, headers[i + 1]?.index);
    const entry = {
      inputPrice: extractFirstUsdAfter(section, 'Input price'),
      outputPrice: extractFirstUsdAfter(section, 'Output price (including thinking tokens)'),
      cacheReadPrice: extractFirstUsdAfter(section, 'Context caching price'),
    };
    if (!Number.isFinite(entry.inputPrice) || !Number.isFinite(entry.outputPrice)) return;
    const ids = [header[1], ...header[2].matchAll(new RegExp(GEMINI_MODEL_ID, 'g')).map((m) => m[0])];
    for (const id of ids) if (!pricing.has(id)) pricing.set(id, entry);
  });
  return pricing;
}

export function parseGrokPricingPage(html) {
  const text = stripHtmlToText(html);
  // 行: grok-4.3 Long context ≥ 200k tokens 1M $1.25 $0.20 $2.50 …(后三列为长上下文价,忽略)
  // 列序为 输入 / 缓存 / 输出
  const rowRe = /\b(grok-[a-z0-9.-]+)\s+(?:Long context[^$]*?\s)?\d+[kM]\s+\$([0-9.]+)\s+\$([0-9.]+)\s+\$([0-9.]+)/g;
  return collectFirstRows(text, rowRe, inputCachedOutput);
}

export function parseDeepSeekPricingPage(html) {
  const text = stripHtmlToText(html);
  const pricing = new Map();
  // 每行先 OFF-PEAK 后 PEAK(各 flash、pro 两列),取各行前两个数即 OFF-PEAK 标准价
  const cacheHits = extractUsdListAfter(text, '1M INPUT TOKENS (CACHE HIT)', 2);
  const cacheMisses = extractUsdListAfter(text, '1M INPUT TOKENS (CACHE MISS)', 2);
  const outputs = extractUsdListAfter(text, '1M OUTPUT TOKENS', 2);
  if (cacheHits.length >= 2 && cacheMisses.length >= 2 && outputs.length >= 2) {
    const flash = {
      inputPrice: cacheMisses[0],
      outputPrice: outputs[0],
      cacheReadPrice: cacheHits[0],
    };
    // deepseek-flash 为现行 id,旧 id deepseek-v4-flash 仍被接受并按 Flash 计费
    pricing.set('deepseek-flash', flash);
    pricing.set('deepseek-v4-flash', { ...flash });
    pricing.set('deepseek-v4-pro', {
      inputPrice: cacheMisses[1],
      outputPrice: outputs[1],
      cacheReadPrice: cacheHits[1],
    });
  }
  return pricing;
}

export function parseKimiPricingMarkdown(text) {
  // 表行(JSX 数组,CNY): ["kimi-k3", "1M tokens", "¥20.00", "¥40.00", "¥2.00", "¥20.00", "¥100.00", "1,048,576 tokens"]
  // 价格列从末尾倒数: 输出、缓存未命中(输入)、缓存命中;K3 另在最前有 5m/1h 缓存写入,取 5m
  const pricing = new Map();
  const rowRe = /\[\s*"(kimi-[a-z0-9.-]+)"\s*,\s*"[^"]*"\s*,\s*((?:"¥[0-9.]+"\s*,\s*)+)"[^"]*"\s*\]/g;
  for (const match of text.matchAll(rowRe)) {
    const prices = [...match[2].matchAll(/¥([0-9.]+)/g)].map((m) => parseFloat(m[1]));
    if (prices.length < 3) continue;
    const entry = {
      inputPrice: prices.at(-2),
      outputPrice: prices.at(-1),
      cacheReadPrice: prices.at(-3),
    };
    if (prices.length > 3) entry.cacheWritePrice = prices[0];
    pricing.set(match[1], entry);
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
  // 表行示例(价格后可带脚注 <sup>1</sup>,模型名后可带括号说明):
  // | Claude Opus 4.5   | $5 / MTok | $6.25 / MTok | $10 / MTok | $0.50 / MTok<sup>1</sup> | $25 / MTok |
  const pricing = new Map();
  const rowRe = /\|\s*(Claude\s+[^|\n]+?)\s*\|((?:\s*\$[0-9.]+\s*\/\s*MTok\s*(?:<sup>[^<]*<\/sup>\s*)?\|){5})/g;
  const nameToId = (name) => {
    const m = name.replace(/\s*\(.*$/, '').match(/^Claude\s+(Opus|Sonnet|Haiku|Fable|Mythos)\s+([0-9]+(?:\.[0-9]+)?)$/i);
    if (!m) return null;
    const family = m[1].toLowerCase();
    // 整数版本(如 Claude Sonnet 4)对应 API id `claude-sonnet-4-<date>`,不加 `-0`
    const ver = m[2].includes('.') ? m[2].replace('.', '-') : m[2];
    return `claude-${family}-${ver}`;
  };
  for (const match of text.matchAll(rowRe)) {
    const modelId = nameToId(match[1]);
    // 按提示长度分档的模型(Haiku 5.5)有多行同名,首行为标准档(≤100k)
    if (!modelId || pricing.has(modelId)) continue;
    const [input, cacheWrite5m, , cacheRead, output] = [...match[2].matchAll(/\$([0-9.]+)/g)].map((m) => parseFloat(m[1]));
    // 取 5m Cache Writes 作为 cacheWritePrice(Anthropic 默认/最常用的 5 分钟缓存)
    pricing.set(modelId, {
      inputPrice: input,
      cacheWritePrice: cacheWrite5m,
      cacheReadPrice: cacheRead,
      outputPrice: output,
    });
  }
  return pricing;
}

export function parseOpenAIPricingMarkdown(text) {
  // 定价页是多张同形 Markdown 表(Standard/Batch/Flex…),首张为 Standard,只解析它;列按表头定位:
  // | Model | Short context input | Short context cached input | Short context cache writes | Short context output | Long context … |
  const pricing = new Map();
  const lines = text.split('\n');
  const start = lines.findIndex((line) => /^\|\s*Model\s*\|/.test(line));
  if (start < 0) return pricing;
  const cells = (line) => line.split('|').slice(1, -1).map((cell) => cell.trim());
  const header = cells(lines[start]);
  const col = (re) => header.findIndex((name) => re.test(name));
  const cols = {
    input: col(/^(?!Long)(?!.*cached).*input/i),
    cacheRead: col(/^(?!Long).*cached input/i),
    cacheWrite: col(/^(?!Long).*cache writes/i),
    output: col(/^(?!Long).*output/i),
  };
  const price = (row, i) => parseFloat(String(row[i] ?? '').replace(/[$,]/g, ''));
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    const row = cells(lines[i]);
    const id = row[0].replace(/\s*\(.*$/, '');
    const entry = { inputPrice: price(row, cols.input), outputPrice: price(row, cols.output) };
    if (!/^[a-z0-9._-]+$/i.test(id) || pricing.has(id)) continue;
    if (!Number.isFinite(entry.inputPrice) || !Number.isFinite(entry.outputPrice)) continue;
    const cacheRead = price(row, cols.cacheRead);
    const cacheWrite = price(row, cols.cacheWrite);
    if (Number.isFinite(cacheRead)) entry.cacheReadPrice = cacheRead;
    if (Number.isFinite(cacheWrite)) entry.cacheWritePrice = cacheWrite;
    pricing.set(id, entry);
  }
  return pricing;
}

export function parseGlmPricingMarkdown(text) {
  // | GLM-5.1 | \$1.4 | \$0.26 | Limited-time Free | \$4.4 |
  const rowRe = /\|\s*(GLM-[A-Za-z0-9.-]+)\s*\|\s*\\?\$([0-9.]+)\s*\|\s*\\?\$([0-9.]+)\s*\|[^|]*\|\s*\\?\$([0-9.]+)\s*\|/g;
  return collectFirstRows(text, rowRe, inputCachedOutput);
}

export function parseMiniMaxPricingMarkdown(text) {
  // | **MiniMax-M2.7** | 2.1 | 8.4 | 0.42 | 2.625 |  (CNY/M tokens — 与现有 qwen 解析器同口径,原值直存)
  // M3 无缓存写入列,价格带删除线原价: | **MiniMax-M3**<br />≤ 512k 输入 tokens … | ~~4.20~~ 2.10 | ~~16.80~~ 8.40 | ~~0.84~~ 0.42 |
  // 取删除线后的现价;M3 按输入长度与标准/优先分多行,首行为标准档 ≤512k
  const cell = '(?:~~[0-9.]+~~\\s*)?([0-9.—-]+)';
  const rowRe = new RegExp(`\\|\\s*\\*{0,2}\\s*(MiniMax-[A-Za-z0-9.-]+)\\s*\\*{0,2}[^|\\n]*\\|\\s*${cell}\\s*\\|\\s*${cell}\\s*\\|\\s*${cell}\\s*\\|(?:\\s*${cell}\\s*\\|)?`, 'g');
  return collectFirstRows(text, rowRe, (match) => {
    const entry = {
      inputPrice: parseFloat(match[2]),
      outputPrice: parseFloat(match[3]),
    };
    const cacheRead = parseFloat(match[4]);
    const cacheWrite = parseFloat(match[5]);
    if (Number.isFinite(cacheRead)) entry.cacheReadPrice = cacheRead;
    if (Number.isFinite(cacheWrite)) entry.cacheWritePrice = cacheWrite;
    return entry;
  });
}

export function parseSiliconFlowPricingPage(html) {
  const text = stripHtmlToText(html);
  // 行(CNY): DeepSeek-V3.2 deepseek-ai/DeepSeek-V3.2 ¥ 4.00 ¥ 6.00 ¥ 0.40(缓存列可为 "-")
  // 分档计价取首档 [0, Nk);按时段计价的行没有统一价,不收录;页面只渲染各厂商折叠前的部分模型
  const price = String.raw`(?:输入 \[0, [0-9]+k\)\s*)?¥\s*([0-9]+(?:\.[0-9]+)?)`;
  const rowRe = new RegExp(String.raw`([A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)+)\s+${price}\s+${price}(?:\s+${price})?`, 'g');
  return collectFirstRows(text, rowRe, (match) => {
    const entry = {
      inputPrice: parseFloat(match[2]),
      outputPrice: parseFloat(match[3]),
    };
    if (match[4] != null) entry.cacheReadPrice = parseFloat(match[4]);
    return entry;
  });
}
