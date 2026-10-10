// 各服务商可调的采样参数的单一来源：前端设置页显示哪些项、后端的配置校验与请求体拼装都以此为准。
// 依据 2026-10 各家官方接口文档；参数如何写进请求体见 backend/llm/providers/_shared/sampling.js。
// 表里没有的服务商（DeepSeek、Kimi、Anthropic 等）采样参数被固定、忽略或会被拒，一律不发送。

export const SAMPLING_PARAMS = Object.freeze({
  top_p: {
    label: 'Top P',
    hint: '只从累计概率排在前 P 的候选词里挑，越小越保守',
    min: 0.01, max: 1, step: 0.01,
  },
  top_k: {
    label: 'Top K',
    hint: '只从概率最高的 K 个候选词里挑，越小越保守',
    min: 1, max: 100, step: 1, integer: true,
  },
  min_p: {
    label: 'Min P',
    hint: '去掉概率低于「最高概率 × P」的候选词，常用 0.05–0.1',
    min: 0, max: 1, step: 0.01,
  },
  repetition_penalty: {
    label: '重复惩罚',
    hint: '即 Repetition Penalty。压低出现过的词再次出现的概率，1 为不惩罚，常用 1.05–1.15',
    min: 0.5, max: 2, step: 0.01,
  },
  presence_penalty: {
    label: '存在惩罚',
    hint: '即 Presence Penalty。出现过的词一律扣分，正值鼓励换新内容',
    min: -2, max: 2, step: 0.1,
  },
  frequency_penalty: {
    label: '频率惩罚',
    hint: '即 Frequency Penalty。词出现得越多扣分越多，正值减少用词重复',
    min: -2, max: 2, step: 0.1,
  },
});

export const SAMPLING_PARAM_KEYS = Object.freeze(Object.keys(SAMPLING_PARAMS));

const TOP_P_ONLY = ['top_p'];
const OPENAI_STYLE = ['top_p', 'presence_penalty', 'frequency_penalty'];

const PROVIDER_SAMPLING_PARAMS = Object.freeze({
  openai: OPENAI_STYLE,
  grok: TOP_P_ONLY,
  openrouter: SAMPLING_PARAM_KEYS,
  glm: TOP_P_ONLY,
  'glm-coding': TOP_P_ONLY,
  minimax: TOP_P_ONLY,
  'minimax-coding': TOP_P_ONLY,
  qwen: ['top_p', 'top_k', 'repetition_penalty', 'presence_penalty'],
  siliconflow: ['top_p', 'top_k', 'min_p', 'frequency_penalty'],
  xiaomi: OPENAI_STYLE,
  'xiaomi-coding': OPENAI_STYLE,
  gemini: ['top_p', 'top_k'],
  ollama: SAMPLING_PARAM_KEYS,
  llamacpp: SAMPLING_PARAM_KEYS,
  lmstudio: ['top_p', 'top_k', 'repetition_penalty', 'presence_penalty', 'frequency_penalty'],
});

export function getSupportedSamplingParams(provider) {
  return PROVIDER_SAMPLING_PARAMS[provider] ?? [];
}

/** 规整成范围内的数字；留空或不是数字时为 null（= 不发送） */
export function normalizeSamplingValue(key, value) {
  const spec = SAMPLING_PARAMS[key];
  if (!spec || value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const clamped = Math.min(spec.max, Math.max(spec.min, number));
  return spec.integer ? Math.round(clamped) : clamped;
}

/** 只留下已设置的项并规整取值；世界卡这类只覆盖部分项的设置按此存取，未列出的项沿用全局设置 */
export function pickSamplingOverrides(value) {
  if (!value || typeof value !== 'object') return {};
  const picked = {};
  for (const key of SAMPLING_PARAM_KEYS) {
    const normalized = normalizeSamplingValue(key, value[key]);
    if (normalized != null) picked[key] = normalized;
  }
  return picked;
}

/** 读世界卡存下的 sampling_json；内容损坏时当作没有覆盖 */
export function parseSamplingOverrides(json) {
  try {
    return pickSamplingOverrides(JSON.parse(json || '{}'));
  } catch {
    return {};
  }
}
