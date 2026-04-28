/**
 * 后端正则替换执行器
 *
 * applyRules(text, scope, worldId) → string
 *
 * 规则从 DB 读取：enabled=1、scope=当前scope、world_id IS NULL 或 world_id=worldId
 * 按 sort_order ASC 链式套用，每条单独 try/catch，失败只 warn 不中断
 */

import { getEnabledRulesForRuntime } from '../db/queries/regex-rules.js';
import { createLogger, formatMeta } from './logger.js';

const log = createLogger('regex');

/**
 * @param {string} text      原始文本
 * @param {string} scope     'user_input' | 'ai_output' | 'display_only' | 'prompt_only'
 * @param {string|null} worldId  当前会话所属世界 id，null 表示全局
 * @param {string} [mode]    'chat' | 'writing'，用于全局规则 mode 过滤，默认 'chat'
 * @returns {string}
 */
export function applyRules(text, scope, worldId, mode = 'chat') {
  let result = text;
  let rules;

  try {
    rules = getEnabledRulesForRuntime(scope, worldId ?? null, mode);
  } catch (err) {
    log.warn(`LOAD FAIL  ${formatMeta({ scope, worldId: worldId ?? null, mode, error: err.message })}`);
    return result;
  }

  for (const rule of rules) {
    if (rule.pattern.length > 500) {
      log.warn(`SKIP LONG PATTERN  ${formatMeta({ id: rule.id, name: rule.name, chars: rule.pattern.length })}`);
      continue;
    }
    try {
      const re = new RegExp(rule.pattern, rule.flags);
      result = result.replace(re, rule.replacement);
    } catch (err) {
      log.warn(`RULE FAIL  ${formatMeta({ id: rule.id, name: rule.name, error: err.message })}`);
    }
  }

  return result;
}
