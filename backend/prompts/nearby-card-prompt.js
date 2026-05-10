/**
 * nearby-card-prompt.js — 写作模式"附近"角色制卡用的 LLM 提示词构建。
 *
 * 由 backend/services/nearby-card-maker.js 的 analyzeNearbyForCard 调用，
 * 输出 [{ role:'user', content:'...' }] 形式的 messages，供 llm.complete 使用。
 *
 * 模板：backend/prompts/templates/writing-nearby-card-analyze.md
 *
 * @module backend/prompts/nearby-card-prompt
 */

import { renderBackendPrompt } from './prompt-loader.js';

/**
 * 构建 nearby 制卡分析用的 messages。
 *
 * @param {object} args
 * @param {string} args.name           nearby 角色名
 * @param {string} args.persona        nearby.persona（一句话人物设定，将作为 description 基底）
 * @param {Array<{field_key:string, runtime_value_json:*}>} args.stateValues
 *   nearby 当前状态值列表（仅 runtime_value_json != null 的会被渲染）
 * @param {Array<{role:string, content:string}>} args.recentMessages
 * @param {number} args.recentRounds   最近多少轮（仅用于提示文字展示）
 * @returns {Array<{role:'user', content:string}>}
 */
export function buildNearbyCardAnalyzePrompt({
  name,
  persona,
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

  const content = renderBackendPrompt('writing-nearby-card-analyze.md', {
    NAME: name,
    STATE_LINES: stateLines || '（无）',
    PERSONA: persona || '（无）',
    RECENT_ROUNDS: recentRounds,
    RECENT_TEXT: recentText || '（无）',
  });

  return [{ role: 'user', content }];
}
