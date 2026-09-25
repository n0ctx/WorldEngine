/**
 * 格式化 token 数量：大数字用 K/M 缩写，小数字加千分位
 */
export function formatTokens(n) {
  if (n == null || Number.isNaN(n)) return '-';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}K`;
  return n.toLocaleString();
}

/**
 * 根据 token 用量和模型单价计算费用（美元）
 * pricing: { inputPrice, outputPrice, cacheReadPrice?, cacheWritePrice? }（单位 $/1M tokens）
 * 返回 null 表示无法计算（无价格信息或全为 0）
 */
export function calcCost(usage, pricing) {
  if (!pricing || (!pricing.inputPrice && !pricing.outputPrice)) return null;
  const inp = ((usage.prompt_tokens ?? 0) * pricing.inputPrice) / 1_000_000;
  const out = ((usage.completion_tokens ?? 0) * pricing.outputPrice) / 1_000_000;
  const cacheRead = pricing.cacheReadPrice
    ? ((usage.cache_read_tokens ?? 0) * pricing.cacheReadPrice) / 1_000_000
    : 0;
  const cacheWrite = pricing.cacheWritePrice
    ? ((usage.cache_creation_tokens ?? 0) * pricing.cacheWritePrice) / 1_000_000
    : 0;
  return inp + out + cacheRead + cacheWrite;
}

export function formatCost(usd) {
  if (usd == null) return null;
  if (usd < 0.000001) return '<$0.000001';
  if (usd < 0.001) return `$${usd.toFixed(6)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}
