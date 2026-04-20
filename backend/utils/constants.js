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
export const PROMPT_ENTRY_SCAN_WINDOW = 5;       // 关键词兜底：扫描最近几条消息
export const PROMPT_ENTRY_LLM_MAX_TOKENS = 300;  // LLM preflight：最大输出 token 数

// ============================
// 记忆召回
// ============================
export const MEMORY_RECALL_MAX_SESSIONS = 3;
export const MEMORY_RECALL_CONTEXT_WINDOW = 10;
export const MEMORY_RECALL_MAX_TOKENS = 2048;
export const MEMORY_RECALL_SIMILARITY_THRESHOLD = 0.84;       // 跨 session 阈值（很严格）
export const MEMORY_RECALL_SAME_SESSION_THRESHOLD = 0.72;     // 同 session 内阈值（严格）

// ============================
// 记忆原文展开（T28）
// ============================
export const MEMORY_EXPAND_MAX_TOKENS = 4096;
export const MEMORY_EXPAND_DECISION_MAX_TOKENS = 200;
export const MEMORY_EXPAND_PER_SESSION_MAX_ROUNDS = 30;

// ============================
// 世界时间线
// ============================
export const WORLD_TIMELINE_RECENT_LIMIT = 5;
export const WORLD_TIMELINE_COMPRESS_THRESHOLD = 50;
export const WORLD_TIMELINE_MAX_ENTRIES = 200;

// ============================
// 消息查询
// ============================
export const ALL_MESSAGES_LIMIT = 9999;

// ============================
// 附件
// ============================
export const MAX_ATTACHMENTS_PER_MESSAGE = 3;
export const MAX_ATTACHMENT_SIZE_MB = 5;

// ============================
// LLM 生成参数（非流式记忆/工具任务）
// ============================
/** 记忆类非流式任务（标题/摘要/状态更新）通用温度 */
export const LLM_TASK_TEMPERATURE = 0.3;
/** 会话标题生成最大 token 数 */
export const LLM_TITLE_MAX_TOKENS = 30;
/** turn record 摘要生成最大 token 数 */
export const LLM_TURN_SUMMARY_MAX_TOKENS = 500;
/** 状态更新（combined-state-updater）最大 token 数 */
export const LLM_STATE_UPDATE_MAX_TOKENS = 1000;
/** writing 空间代入（impersonate）最大 token 数 */
export const LLM_IMPERSONATE_MAX_TOKENS = 300;
/** Ollama 工具调用 resolveToolContext 首轮最大 token 数 */
export const LLM_TOOL_RESOLUTION_MAX_TOKENS = 200;

// ============================
// Anthropic / Gemini extended thinking budget
// ============================
export const LLM_THINKING_BUDGET_LOW    = 1024;
export const LLM_THINKING_BUDGET_MEDIUM = 8192;
export const LLM_THINKING_BUDGET_HIGH   = 16384;

// ============================
// 本地 LLM 服务默认地址
// ============================
export const OLLAMA_DEFAULT_BASE_URL   = 'http://localhost:11434';
export const LMSTUDIO_DEFAULT_BASE_URL = 'http://localhost:1234';
