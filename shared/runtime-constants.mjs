// 前后端共享的运行时常量：避免双端 desync。
// 仅放需要前端 + 后端两侧都消费的值；后端独占常量留在 backend/utils/constants.js。

// ---- 附件 ----
export const MAX_ATTACHMENTS_PER_MESSAGE = 3;
export const MAX_ATTACHMENT_SIZE_MB = 5;

// ---- 本地 LLM 服务默认地址 ----
export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';
export const LMSTUDIO_DEFAULT_BASE_URL = 'http://localhost:1234';

// ---- 流任务 ----
export const RESTART_INTERRUPTED_ERROR = 'interrupted by restart';

// ---- 副模型 / 后台 LLM 错误分类 ----
// 后端 backend/utils/post-gen-runner.js#classifyLlmError 写入，前端
// frontend/src/core/api/postgen-error-toast.js 据此渲染 toast。新增 reason 必须同步更新两端。
export const LLM_ERROR_REASON = Object.freeze({
  TIMEOUT: 'timeout',
  QUOTA: 'quota',
  AUTH: 'auth',
  RATE_LIMIT: 'rate_limit',
  SERVER: 'server',
  UNKNOWN: 'unknown',
});
