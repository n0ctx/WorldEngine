// ============================
// LLM 调用
// ============================
export const LLM_RETRY_MAX = 3;
export const LLM_RETRY_DELAY_MS = 1000;

// ============================
// 异步队列
// ============================
export const ASYNC_QUEUE_MAX_SIZE = 20;

// ============================
// 上下文与提示词
// ============================
export const CONTEXT_MIN_HISTORY_ROUNDS = 4;
export const PROMPT_ENTRY_SCAN_WINDOW = 5;
export const PROMPT_ENTRY_SIMILARITY_THRESHOLD = 0.72;
export const PROMPT_ENTRY_TOP_K = 3;

// ============================
// 记忆召回
// ============================
export const MEMORY_RECALL_MAX_SESSIONS = 3;
export const MEMORY_RECALL_CONTEXT_WINDOW = 10;
export const MEMORY_RECALL_MAX_TOKENS = 2048;

// ============================
// 世界时间线
// ============================
export const WORLD_TIMELINE_RECENT_LIMIT = 20;
export const WORLD_TIMELINE_COMPRESS_THRESHOLD = 50;
export const WORLD_TIMELINE_MAX_ENTRIES = 200;

// ============================
// 附件
// ============================
export const MAX_ATTACHMENTS_PER_MESSAGE = 3;
export const MAX_ATTACHMENT_SIZE_MB = 5;
