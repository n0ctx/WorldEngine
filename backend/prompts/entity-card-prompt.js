/**
 * entity-card-prompt.js — 状态记忆实体制卡用的 LLM 提示词构建。
 *
 * 由 backend/services/entity-card-maker.js 的 analyzeEntityForCard 调用，
 * 输出 [{ role:'user', content:'...' }] 形式的 messages，供 llm.complete 使用。
 *
 * 模板：backend/prompts/templates/writing-entity-card-analyze.md
 *
 * @module backend/prompts/entity-card-prompt
 */

import { renderBackendPrompt } from './prompt-loader.js';

/**
 * 构建实体制卡分析用的 messages。
 *
 * @param {object} args
 * @param {string} args.name           实体名
 * @param {string} args.profileText    实体档案纯文本（renderEntityProfileText，将作为 description 基底）
 * @param {Array<{field_key:string, runtime_value_json:*}>} args.stateValues
 *   实体当前状态值列表（仅 runtime_value_json != null 的会被渲染）
 * @param {Array<{role:string, content:string}>} args.recentMessages
 * @param {number} args.recentRounds   最近多少轮（仅用于提示文字展示）
 * @returns {Array<{role:'user', content:string}>}
 */
export function buildEntityCardAnalyzePrompt({
  name,
  profileText,
  stateValues,
  recentMessages,
  recentRounds,
}) {
  const stateLines = stateValues
    .filter((v) => v.runtime_value_json != null)
    .map((v) => `- ${v.field_key}: ${v.runtime_value_json}`)
    .join('\n');

  const recentText = recentMessages
    .map((m) => `[${m.role}] ${m.content ?? ''}`)
    .join('\n\n');

  const content = renderBackendPrompt('writing-entity-card-analyze.md', {
    NAME: name,
    STATE_LINES: stateLines || '（无）',
    PROFILE_TEXT: profileText || '（无）',
    RECENT_ROUNDS: recentRounds,
    RECENT_TEXT: recentText || '（无）',
  });

  return [{ role: 'user', content }];
}
