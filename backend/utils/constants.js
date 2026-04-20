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
// 选项提示（选项功能后置注入，对用户不可见）
// ============================
export const SUGGESTION_PROMPT = `正文结束后，必须在末尾新起一行输出选项块。每条选项都是「{{user}}」下一条可能发出的消息——以第一人称口语写就，像真人会发出去的一句话，主动推进剧情，避免纯粹的被动回应（如"好的""嗯"等），引入行动、决定、问题或意外举动，简洁不冗长。

格式如下（开标签、每条选项、闭标签各自独占一行，禁止合并到同一行）：

<next_prompt>
选项一
选项二
选项三
</next_prompt>

规则：① <next_prompt> 单独一行；② 每条选项单独一行，纯文字无格式符；③ </next_prompt> 单独一行，不可省略；④ 标签外无任何附言。`;
