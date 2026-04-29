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
export const MEMORY_RECALL_MAX_SESSIONS = 5;
export const MEMORY_RECALL_CONTEXT_WINDOW = 10;
export const MEMORY_RECALL_MAX_TOKENS = 2048;
export const MEMORY_RECALL_SIMILARITY_THRESHOLD = 0.75;       // 跨 session 阈值
export const MEMORY_RECALL_SAME_SESSION_THRESHOLD = 0.6;     // 同 session 内阈值

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

// ============================
// 日记系统（T155）
// ============================
/** 日记时间字段的保留 field_key（不可修改）*/
export const DIARY_TIME_FIELD_KEY = 'diary_time';
/** 虚拟日期模式下的固定 update_instruction */
export const DIARY_TIME_UPDATE_INSTRUCTION = '每轮对话必须更新此字段。根据本轮内容判断时间流逝了多少（几分钟/几小时/几天均可），在当前运行时值基础上推进，不得重复上一轮的值。格式必须严格为：N年N月N日N时N分（例：1000年3月15日14时30分），不得省略任何部分，不得使用其他格式。';
/** 日记时间字段的内置 description（用于 LLM 理解字段用途）*/
export const DIARY_TIME_DESCRIPTION = '故事世界中当前的时间节点（世界内时间，非现实时间）';
/** 日记面板默认展示条数（最近 N 条展开，其余折叠）*/
export const DIARY_PANEL_RECENT_LIMIT = 5;
/** 日记 LLM 生成最大 token 数 */
export const LLM_DIARY_MAX_TOKENS = 2000;

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
export const LLM_STATE_UPDATE_MAX_TOKENS = 2048;
/** 状态压缩（state-compress）最大 token 数 */
export const LLM_STATE_COMPRESS_MAX_TOKENS = 512;

// ============================
// 状态字段长度限制
// ============================
/** text 字段值触发压缩的字数阈值 */
export const STATE_TEXT_MAX_LENGTH = 50;
/** text 字段压缩目标字数 */
export const STATE_TEXT_COMPRESS_TARGET = 20;
/** list 字段触发裁剪的条目数阈值 */
export const STATE_LIST_MAX_ITEMS = 10;
/** list 字段裁剪目标条目数 */
export const STATE_LIST_TRIM_TARGET = 5;
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

// ============================
// 章节分组（后端副本，需与 frontend/src/utils/constants.js 保持同步）
// ============================
/** 每 N 条消息触发新章节（与前端 CHAPTER_MESSAGE_SIZE 相同） */
export const CHAPTER_MESSAGE_SIZE = 20;
/** 时间间隔超过此值（毫秒）触发新章节（与前端 CHAPTER_TIME_GAP_MS 相同） */
export const CHAPTER_TIME_GAP_MS  = 6 * 60 * 60 * 1000;
/** 章节标题生成最大 token 数 */
export const LLM_CHAPTER_TITLE_MAX_TOKENS = 30;
