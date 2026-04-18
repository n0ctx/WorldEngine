/**
 * 后端正则替换执行器
 *
 * applyRules(text, scope, worldId) → string
 *
 * 规则从 DB 读取：enabled=1、scope=当前scope、world_id IS NULL 或 world_id=worldId
 * 按 sort_order ASC 链式套用，每条单独 try/catch，失败只 warn 不中断
 */

import { getEnabledRulesForRuntime } from '../db/queries/regex-rules.js';

/**
 * @param {string} text      原始文本
 * @param {string} scope     'user_input' | 'ai_output' | 'display_only' | 'prompt_only'
 * @param {string|null} worldId  当前会话所属世界 id，null 表示全局
 * @returns {string}
 */
export function applyRules(text, scope, worldId) {
  let result = text;
  let rules;

  try {
    rules = getEnabledRulesForRuntime(scope, worldId ?? null);
  } catch (err) {
    console.warn('[regex-runner] 读取规则失败:', err.message);
    return result;
  }

  for (const rule of rules) {
    if (rule.pattern.length > 500) {
      console.warn(`[regex-runner] 规则 "${rule.name}" (id=${rule.id}) pattern 超长（${rule.pattern.length} 字符），已跳过`);
      continue;
    }
    try {
      const re = new RegExp(rule.pattern, rule.flags);
      result = result.replace(re, rule.replacement);
    } catch (err) {
      console.warn(`[regex-runner] 规则 "${rule.name}" (id=${rule.id}) 执行失败:`, err.message);
    }
  }

  return result;
}
