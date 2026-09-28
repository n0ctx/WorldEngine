import {
  CHAPTER_MESSAGE_SIZE as SHARED_CHAPTER_MESSAGE_SIZE,
} from '../../shared/chapter-constants.mjs';

export { resolveChapterMessageSize } from '../../shared/chapter-constants.mjs';

export {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_SIZE_MB,
  OLLAMA_DEFAULT_BASE_URL,
  LMSTUDIO_DEFAULT_BASE_URL,
  LLAMACPP_DEFAULT_BASE_URL,
} from '../../shared/runtime-constants.mjs';

// ============================
// LLM 调用
// ============================
export const LLM_RETRY_MAX = 3;
export const LLM_RETRY_DELAY_MS = 1000;
export const LLM_BACKGROUND_TASK_TIMEOUT_MS = Number(process.env.WE_LLM_BACKGROUND_TASK_TIMEOUT_MS) || 20_000;
// 本地 provider（ollama / lmstudio / llamacpp）推理慢，后台任务超时下限单独放宽
export const LLM_LOCAL_BACKGROUND_TASK_TIMEOUT_MS = Number(process.env.WE_LLM_LOCAL_BACKGROUND_TASK_TIMEOUT_MS) || 60_000;

// ============================
// 异步队列
// ============================
export const ASYNC_QUEUE_MAX_SIZE = 20;

// ============================
// 上下文与提示词
// ============================
export const PROMPT_ENTRY_LLM_MAX_TOKENS = 300;  // LLM preflight：最大输出 token 数
export const SUGGESTION_TOKEN_RESERVE = 200;     // 选项生成预留输出空间：标签20t+三条中文选项~100t+换行~10t≈130t，取200安全余量

// ============================
// 记忆召回
// ============================
/** turn 摘要锚点中 cast 人物名条数上限（与 memory-turn-summary*.md 模板中的 4 个一致） */
export const TURN_SUMMARY_CAST_MAX = 4;

// ============================
// 记忆分层（memory-v2）
// ============================
/** 中期摘要单条最大 token 数 */
export const MIDDLE_SUMMARY_MAX_TOKENS = 1000;
/** 中期摘要压缩输入（原文轮次拼接后）最大 token 数 */
export const MIDDLE_COMPRESS_INPUT_MAX_TOKENS = 12000;
/** 中期摘要覆盖的原文轮数上限 */
export const MIDDLE_RAW_ROUNDS_MAX = 20;
/** 长期记忆索引条目单条最大 token 数 */
export const LONG_TERM_INDEX_MAX_TOKENS = 100;
/** 每次回填长期记忆索引的 turn record 条数上限 */
export const TURN_INDEX_BACKFILL_MAX = 3;
/** 长期记忆召回超时时间（毫秒） */
export const LONG_TERM_RECALL_TIMEOUT_MS = 30000;

// ============================
// 记忆原文展开（T28）
// ============================
export const MEMORY_EXPAND_MAX_TOKENS = 4096;
export const MEMORY_EXPAND_DECISION_MAX_TOKENS = 200;

// ============================
// 世界时间线
// ============================
export const WORLD_TIMELINE_RECENT_LIMIT = 5;

// ============================
// 日记系统（T155）
// ============================
/** 日记 LLM 生成最大 token 数 */
export const LLM_DIARY_MAX_TOKENS = 2000;

// ============================
// 消息查询
// ============================
// null 表示不分页：getMessagesBySessionId 在 limit 为 null/<=0 时返回该会话全部消息，
// 避免超长会话被旧的 9999 上限截掉最早历史。
export const ALL_MESSAGES_LIMIT = null;

// ============================
// 附件 / 本地 LLM 默认 URL：见文件顶部 re-export，单一来源在 shared/runtime-constants.mjs
// ============================

// ============================
// LLM 生成参数（非流式记忆/工具任务）
// ============================
/** 记忆类非流式任务（标题/摘要/状态更新）通用温度 */
export const LLM_TASK_TEMPERATURE = 0.3;
/** 会话标题生成最大 token 数 */
export const LLM_TITLE_MAX_TOKENS = 30;
/** 轮次索引生成最大 token 数（输出 JSON 包装 + scene + cast + 80 字摘要，900 留出余量避免被截） */
export const LLM_TURN_SUMMARY_MAX_TOKENS = 900;
/** 状态更新（combined-state-updater）最大 token 数：状态记忆写入并入该调用后输出增加操作列表，上限相应调大 */
export const LLM_STATE_UPDATE_MAX_TOKENS = 8192;
/** 状态更新 JSON 解析失败时，额外重新调用 LLM 的最大次数（共 1+N 次机会） */
export const STATE_UPDATE_JSON_RETRY_MAX = 2;
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
export const STATE_LIST_TRIM_TARGET = 8;
/** 工具调用循环（complete-with-tools）最大轮数：写卡助手 dispatch_subagent 多步派发场景需要更大上限，原硬编码 5 在多步任务下会让模型未消化的 tool_use 漏到普通文本里（产生 <｜DSML｜...> 泄漏） */
export const LLM_TOOL_RESOLUTION_MAX_ITERATIONS = 25;

// ============================
// 状态记忆（memory-v2 第二阶段）
// ============================
/** 当前有效的世界事实条数上限 */
export const STATE_WORLD_FACTS_MAX = 20;
/** 状态更新提示词里「实体目录」段的 token 预算 */
export const STATE_DIRECTORY_BUDGET = 3000;
/** 档案文本字段最大字数 */
export const STATE_TEXT_FIELD_MAX = 60;
/** 档案 list 字段单项最大字数 */
export const STATE_LIST_ITEM_MAX = 30;
/** 档案证据原文最短字符数 */
export const STATE_EVIDENCE_MIN = 4;
/** 档案证据原文最长字符数 */
export const STATE_EVIDENCE_MAX = 80;
/** 每轮状态更新最多要求补全空缺的旧实体数（人物、事物各算一份） */
export const STATE_PROFILE_FILL_PER_ROUND = 3;
/** 按名字/别名匹配实体时的最短字数 */
export const STATE_NAME_MATCH_MIN = 2;

// ============================
// Anthropic / Gemini extended thinking budget
// ============================
export const LLM_THINKING_BUDGET_LOW    = 1024;
export const LLM_THINKING_BUDGET_MEDIUM = 8192;
export const LLM_THINKING_BUDGET_HIGH   = 16384;

// ============================
// 章节分组与翻页（前后端共享单一来源，互相解耦）
// ============================
/** 每 N 条消息触发新章节（= CHAPTER_TURN_SIZE * 2，含 user+assistant） */
export const CHAPTER_MESSAGE_SIZE = SHARED_CHAPTER_MESSAGE_SIZE;
/** 章节标题生成最大 token 数 */
export const LLM_CHAPTER_TITLE_MAX_TOKENS = 30;

// ============================
// 前端日志上报（client-logs）
// ============================
/** 单次 POST 最大日志条数 */
export const CLIENT_LOG_MAX_BATCH = 100;
/** 单次 POST 体积上限（256KB） */
export const CLIENT_LOG_MAX_PAYLOAD_BYTES = 256 * 1024;
/** 每 IP 每秒上报次数上限 */
export const CLIENT_LOG_RATE_PER_SEC = 10;
