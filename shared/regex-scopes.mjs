/**
 * regex-scopes.mjs — 正则规则 scope 的单一真源
 *
 * 跨端共享：前端设置面板（RegexRulesManager / RegexRuleEditor）与后端校验都应消费这里的常量，
 * 避免 scope 取值 / 文案在多处硬编码漂移。
 *
 * 注意：assistant/server/normalize-proposal.js 当前由其他 agent 维护，暂未迁移到此处，
 * 其本地 VALID_REGEX_SCOPES 必须与本文件 REGEX_SCOPES 保持一致。
 */

/** scope 取值顺序（链式执行 / UI 分组顺序） */
export const REGEX_SCOPES = ['user_input', 'ai_output', 'display_only', 'prompt_only'];

/** scope 中文短标签 */
export const REGEX_SCOPE_LABELS = {
  user_input: '用户输入',
  ai_output: 'AI 输出',
  display_only: '仅显示',
  prompt_only: '仅提示词',
};

/** scope 详细说明（用于编辑器选项文案） */
export const REGEX_SCOPE_DESCRIPTIONS = {
  user_input: '发送前处理，影响存库与 LLM',
  ai_output: '流式完结后处理，影响存库与显示',
  display_only: '渲染时处理，不改存库',
  prompt_only: '组装历史消息时处理，仅影响送给 LLM 的副本',
};

/** scope 分组提示（用于规则列表分组小标题，措辞偏触发时机） */
export const REGEX_SCOPE_HINTS = {
  user_input: '前端发送前，影响存库与 LLM',
  ai_output: '后端流式完结后，影响存库与显示',
  display_only: '前端渲染时，不改存库',
  prompt_only: '后端历史消息组装时，仅影响 LLM 副本',
};

/** 校验用集合 */
export const VALID_REGEX_SCOPES = new Set(REGEX_SCOPES);
