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
export const LLM_BACKGROUND_TASK_TIMEOUT_MS = Number(process.env.WE_LLM_BACKGROUND_TASK_TIMEOUT_MS) || 30_000;
// 本地 provider（ollama / lmstudio / llamacpp）推理慢，后台任务超时下限单独放宽
export const LLM_LOCAL_BACKGROUND_TASK_TIMEOUT_MS = Number(process.env.WE_LLM_LOCAL_BACKGROUND_TASK_TIMEOUT_MS) || 60_000;
// 工具循环（completeWithTools）里每次模型请求的超时窗口；调用方未传 timeoutMs 时使用。本地模型推理慢，单独放宽
export const LLM_TOOL_TURN_TIMEOUT_MS = Number(process.env.WE_LLM_TOOL_TURN_TIMEOUT_MS) || 300_000;
export const LLM_LOCAL_TOOL_TURN_TIMEOUT_MS = Number(process.env.WE_LLM_LOCAL_TOOL_TURN_TIMEOUT_MS) || 900_000;

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
// 上下文压缩（memory/context/）
// ============================
/** 最近这么多轮始终保留原文，不进入压缩 */
export const CONTEXT_PRESERVE_RECENT_ROUNDS = 3;
/** 从最新一轮往前累计，原文至少保留到短期预算的这个比例（不足 CONTEXT_PRESERVE_RECENT_ROUNDS 轮时以轮数为准） */
export const CONTEXT_PROTECT_TOKEN_RATIO = 0.4;
/** 当前场景（与最新一轮同场景的连续轮次）最多保护到短期预算的这个比例 */
export const CONTEXT_SCENE_PROTECT_RATIO = 0.7;
/** 上次尝试压缩之后，原文至少再增长短期预算的这个比例才再次尝试（成功后以压缩后的原文量为基线） */
export const CONTEXT_GROWTH_STEP_RATIO = 0.25;
/** 单个一级压缩范围的原文下限（token），太短的范围压缩不划算 */
export const CONTEXT_MIN_FOLD_TOKENS = 300;
/** 可压缩的原文合计不足这么多 token 时，即使超预算也不调用模型 */
export const CONTEXT_MIN_BENEFIT_TOKENS = 600;
/** 上一轮提示词占模型上下文上限的比例达到这个值时，忽略增长门槛直接尝试压缩 */
export const CONTEXT_PRESSURE_RATIO = 0.75;
/** 压力下模型放弃或失败后，隔这么多轮才再试（期间仍按增长门槛判断），免得每轮都调用一次副模型 */
export const CONTEXT_PRESSURE_RETRY_ROUNDS = 3;
/** 连续 n 次没有写入块（放弃、失败、过期）后，增长步长与压力冷却轮数都乘以 2^min(n, 这个值)；一次成功写入后清零 */
export const CONTEXT_BACKOFF_MAX_EXPONENT = 3;
/** 提示词占上下文上限的比例超过这个值、或原文超过短期预算的 CONTEXT_RAW_HARD_CAP_RATIO 倍时，
 *  组装时把最老的未保护原文移出视野（原文仍在库里、可被长期召回），作为压缩失败时的兜底 */
export const CONTEXT_EMERGENCY_RATIO = 0.9;
export const CONTEXT_RAW_HARD_CAP_RATIO = 2;
/** 压缩块摘要的总量上限：短期预算的这个比例。超出时从最老的块起提炼，直到回落到上限的 CONTEXT_SUMMARY_LOW_WATER_RATIO */
export const CONTEXT_SUMMARY_BUDGET_RATIO = 0.6;
export const CONTEXT_SUMMARY_LOW_WATER_RATIO = 0.75;
/** 块建成后又过了这么多轮才算「老块」，只有老块参与提炼 */
export const CONTEXT_PROMOTION_ROUNDS = 6;
/** 一次提炼合并的相邻老块个数范围：至少 2 个才算合并，至多 4 个，免得一步压掉太多细节 */
export const CONTEXT_TIER_MIN_BLOCKS = 2;
export const CONTEXT_TIER_MAX_BLOCKS = 4;
/** 各级摘要的字数上下限 */
export const CONTEXT_SUMMARY_MIN_CHARS = 20;
export const CONTEXT_SUMMARY_MAX_CHARS = Object.freeze({ 1: 800, 2: 1000, 3: 1200 });
/** 摘要 token 不得超过来源 token 的这个比例，否则不算压缩 */
export const CONTEXT_SUMMARY_MAX_SOURCE_RATIO = 0.8;
/** 一次压缩调用（含工具循环里的每次请求）的超时：输入可达 CONTEXT_COMPRESS_INPUT_MAX_TOKENS，比一般后台任务放宽 */
export const CONTEXT_COMPRESS_TIMEOUT_MS = 60000;
/** 压缩调用的工具循环轮数上限（含按报错重提交） */
export const CONTEXT_COMPRESS_MAX_ITERATIONS = 3;
/** 一次压缩调用最多交给模型的可压缩原文 token：短期预算的 CONTEXT_COMPRESS_INPUT_BUDGET_RATIO 倍，且不超过
 * CONTEXT_COMPRESS_INPUT_MAX_TOKENS；更晚的可压原文留到下一次（积压时不等增长，接着压） */
export const CONTEXT_COMPRESS_INPUT_BUDGET_RATIO = 2;
export const CONTEXT_COMPRESS_INPUT_MAX_TOKENS = 24000;
/** 压缩提示里每条近期保护原文的最大字数（只供判断剧情走向，不在压缩范围内） */
export const CONTEXT_RECENT_PREVIEW_CHARS = 400;
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
export const STATE_TEXT_MAX_LENGTH = 60;
/** text 字段压缩目标字数，也是提示词里告诉模型的字数上限 */
export const STATE_TEXT_COMPRESS_TARGET = 40;
/** list 字段触发裁剪的条目数阈值 */
export const STATE_LIST_MAX_ITEMS = 10;
/** list 字段裁剪目标条目数 */
export const STATE_LIST_TRIM_TARGET = 8;
/** 工具调用循环（complete-with-tools）最大轮数：写卡助手 dispatch_subagent 多步派发场景需要更大上限，原硬编码 5 在多步任务下会让模型未消化的 tool_use 漏到普通文本里（产生 <｜DSML｜...> 泄漏） */
export const LLM_TOOL_RESOLUTION_MAX_ITERATIONS = 25;

// ============================
// 状态记忆（memory-v2 第二阶段）
// ============================
/** 状态更新提示词里「实体目录」段的 token 预算 */
export const STATE_DIRECTORY_BUDGET = 3000;
/** 档案文本字段最大字数 */
export const STATE_TEXT_FIELD_MAX = 60;
/** 档案 list 字段单项最大字数 */
export const STATE_LIST_ITEM_MAX = 30;
/** 每轮状态更新最多要求补全空缺的旧实体数（人物、事物各算一份） */
export const STATE_PROFILE_FILL_PER_ROUND = 3;
/** 按名字/别名匹配实体时的最短字数 */
export const STATE_NAME_MATCH_MIN = 2;
/** 进行中事项连续这么多轮没被对话碰到，就自动搁置 */
export const THREAD_DORMANT_AFTER_ROUNDS = 12;
/** 未了事项期限的取值之一：副模型判断这件事本身没有时限时写这个，不会过期 */
export const THREAD_NO_DEADLINE = '无期限';

// ============================
// 思考强度档位与预算（前后端共享单一来源）
// ============================
export {
  THINKING_BUDGET_LOW,
  THINKING_BUDGET_MEDIUM,
  THINKING_BUDGET_HIGH,
  isThinkingLevelSupported,
} from '../../shared/thinking-levels.mjs';

// ============================
// 采样参数（前后端共享单一来源）
// ============================
export {
  SAMPLING_PARAM_KEYS,
  getSupportedSamplingParams,
  normalizeSamplingValue,
  pickSamplingOverrides,
  parseSamplingOverrides,
} from '../../shared/sampling-params.mjs';

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

// ============================
// 本地日志保留
// ============================
/** 主日志 worldengine-YYYY-MM-DD.log 保留天数 */
export const LOG_MAIN_RETENTION_DAYS = 14;
/** 原始日志 llm-raw/*.json 保留天数 */
export const LOG_RAW_RETENTION_DAYS = 3;
/** 原始日志总量上限（300MB），超出时从最旧的删起 */
export const LOG_RAW_MAX_BYTES = 300 * 1024 * 1024;
/** 每写入多少个原始日志文件检查一次保留规则（首个文件也会检查） */
export const LOG_RAW_PRUNE_EVERY = 100;
/** 警告行里模型输出的预览字数；完整原文见原始日志 */
export const LOG_WARN_PREVIEW_CHARS = 160;
