// 把后端 state_update_failed / postprocess_failed 的结构化错误映射为可操作的 toast 文案。
// 后端 backend/utils/post-gen-runner.js#classifyLlmError 同步维护 reason 枚举（见 shared/runtime-constants.mjs）。

import { LLM_ERROR_REASON } from '../../../../shared/runtime-constants.mjs';

const { TIMEOUT, QUOTA, AUTH, RATE_LIMIT, SERVER } = LLM_ERROR_REASON;

// 每个 (kind, reason) 的文案：值是 (provider) => string；不带 provider 的也用箭头函数以保持调用一致。
const TOAST_TEXT = {
  state: {
    [TIMEOUT]: () => '状态整理超时，可降低副模型思考强度或换更快的模型',
    [QUOTA]: (p) => `副模型${p}余额/额度不足，请检查账户或切换副模型`,
    [AUTH]: (p) => `副模型${p}鉴权失败，请检查 API key`,
    [RATE_LIMIT]: (p) => `副模型${p}被限流，稍后重试`,
    [SERVER]: (p) => `副模型${p}服务端错误，稍后重试`,
    fallback: () => '状态整理失败，数据可能未更新',
  },
  postprocess: {
    [TIMEOUT]: () => '后台整理超时，回复已保留，标题或状态可能未更新',
    [QUOTA]: (p) => `副模型${p}余额/额度不足，回复已保留，标题/记忆可能未更新`,
    [AUTH]: (p) => `副模型${p}鉴权失败，回复已保留，标题/记忆可能未更新`,
    [RATE_LIMIT]: (p) => `副模型${p}被限流，回复已保留，标题/记忆可能未更新`,
    [SERVER]: (p) => `副模型${p}服务端错误，回复已保留`,
    fallback: () => '后台整理失败，回复已保留，标题或状态可能未更新',
  },
};

export function buildPostgenToast(evt, kind) {
  const table = TOAST_TEXT[kind];
  const provider = evt?.provider ? `「${evt.provider}」` : '';
  return (table[evt?.reason] ?? table.fallback)(provider);
}
