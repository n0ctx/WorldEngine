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
