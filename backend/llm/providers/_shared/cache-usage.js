const ANTHROPIC_EXPLICIT_PROVIDERS = new Set(['anthropic', 'kimi-coding', 'minimax-coding']);
const DEEPSEEK_PREFIX_PROVIDERS = new Set(['deepseek']);
const GEMINI_IMPLICIT_PROVIDERS = new Set(['gemini']);
const LOCAL_OR_UNKNOWN_PROVIDERS = new Set(['ollama', 'lmstudio', 'mock']);

const OPENAI_PREFIX_PROVIDERS = new Set([
  'openai',
  'openrouter',
  'glm',
  'glm-coding',
  'kimi',
  'minimax',
  'grok',
  'siliconflow',
  'qwen',
  'xiaomi',
]);

function firstNumber(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function setIfNumber(target, key, value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    target[key] = value;
  }
}

export function getPromptCacheStrategy(provider) {
  if (ANTHROPIC_EXPLICIT_PROVIDERS.has(provider)) return 'anthropic-explicit';
  if (DEEPSEEK_PREFIX_PROVIDERS.has(provider)) return 'deepseek-prefix';
  if (GEMINI_IMPLICIT_PROVIDERS.has(provider)) return 'gemini-implicit';
  if (OPENAI_PREFIX_PROVIDERS.has(provider)) return 'openai-prefix';
  if (LOCAL_OR_UNKNOWN_PROVIDERS.has(provider)) return 'local-or-unknown';
  return 'local-or-unknown';
}

export function recordTokenUsage(usageRef, usage, provider) {
  if (!usageRef || !usage || typeof usage !== 'object') return;

  const promptDetails = usage.prompt_tokens_details || usage.promptTokensDetails || {};

  setIfNumber(usageRef, 'prompt_tokens', firstNumber(
    usage.input_tokens,
    usage.inputTokens,
    usage.prompt_tokens,
    usage.promptTokens,
    usage.promptTokenCount,
  ));

  setIfNumber(usageRef, 'completion_tokens', firstNumber(
    usage.output_tokens,
    usage.outputTokens,
    usage.completion_tokens,
    usage.completionTokens,
    usage.candidatesTokenCount,
  ));

  setIfNumber(usageRef, 'cache_creation_tokens', firstNumber(
    usage.cache_creation_input_tokens,
    usage.cacheCreationInputTokens,
  ));

  setIfNumber(usageRef, 'cache_read_tokens', firstNumber(
    usage.cache_read_input_tokens,
    usage.cacheReadInputTokens,
    usage.cachedContentTokenCount,
    usage.cached_content_token_count,
    usage.prompt_cache_hit_tokens,
    usage.promptCacheHitTokens,
    promptDetails.cached_tokens,
    promptDetails.cachedTokens,
    promptDetails.prompt_cache_hit_tokens,
    promptDetails.promptCacheHitTokens,
  ));

  setIfNumber(usageRef, 'cache_miss_tokens', firstNumber(
    usage.prompt_cache_miss_tokens,
    usage.promptCacheMissTokens,
    promptDetails.prompt_cache_miss_tokens,
    promptDetails.promptCacheMissTokens,
  ));

  // 归一化:让 prompt_tokens 始终表示「按 input 单价计费的 未命中输入 token 数」。
  // Anthropic 的 input_tokens 本就已经是未命中输入,跳过;其他 provider 的 prompt_tokens
  // 包含 cache_read(及/或 cache_creation),否则前端会把命中部分按 input 和 cache_read 各算一次。
  const strategy = getPromptCacheStrategy(provider);
  const cacheRead = Number.isFinite(usageRef.cache_read_tokens) ? usageRef.cache_read_tokens : 0;
  const cacheMiss = Number.isFinite(usageRef.cache_miss_tokens) ? usageRef.cache_miss_tokens : 0;

  if (strategy === 'deepseek-prefix' && cacheMiss > 0) {
    usageRef.prompt_tokens = cacheMiss;
  } else if (
    (strategy === 'openai-prefix' || strategy === 'gemini-implicit' || strategy === 'deepseek-prefix')
    && Number.isFinite(usageRef.prompt_tokens)
    && cacheRead > 0
    && usageRef.prompt_tokens >= cacheRead
  ) {
    usageRef.prompt_tokens = usageRef.prompt_tokens - cacheRead;
  }
}

export const __testables = {
  ANTHROPIC_EXPLICIT_PROVIDERS,
  OPENAI_PREFIX_PROVIDERS,
  DEEPSEEK_PREFIX_PROVIDERS,
  GEMINI_IMPLICIT_PROVIDERS,
  firstNumber,
};
