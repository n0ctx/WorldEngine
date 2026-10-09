// 采样参数写进请求体：只取当前服务商支持且已设置的项（见 shared/sampling-params.mjs）。
import { getSupportedSamplingParams, normalizeSamplingValue } from '../../../utils/constants.js';

// 本地推理服务把 repetition_penalty 叫作 repeat_penalty
const REPEAT_PENALTY_PROVIDERS = new Set(['ollama', 'llamacpp', 'lmstudio']);

/** 返回 { 请求体字段名: 值 }；Gemini 的驼峰字段名由其适配器自行转换 */
export function resolveSamplingFields(config) {
  const fields = {};
  for (const key of getSupportedSamplingParams(config?.provider)) {
    const value = normalizeSamplingValue(key, config.sampling?.[key]);
    if (value == null) continue;
    const field = key === 'repetition_penalty' && REPEAT_PENALTY_PROVIDERS.has(config.provider) ? 'repeat_penalty' : key;
    fields[field] = value;
  }
  return fields;
}
