/**
 * 前端正则替换执行器
 *
 * 维护一个模块级规则缓存，通过 loadRules() 填充，通过 invalidateCache() 清除。
 * applyRules(text, scope, worldId) 从缓存中过滤规则后同步执行。
 */

import { listRegexRules } from '../api/regex-rules.js';

// 模块级缓存，null 表示未加载
let _cachedRules = null;

/**
 * 拉取全部规则到缓存（打开设置页或规则变更后调用）
 */
export async function loadRules() {
  try {
    _cachedRules = await listRegexRules();
  } catch (err) {
    console.warn('[regex-runner] 规则加载失败:', err.message);
    _cachedRules = [];
  }
}

/**
 * 清除缓存，下次 applyRules 调用前需重新 loadRules()
 */
export function invalidateCache() {
  _cachedRules = null;
}

/**
 * 同步应用规则（需在 loadRules() 完成后调用）
 *
 * @param {string} text      原始文本
 * @param {string} scope     'user_input' | 'ai_output' | 'display_only' | 'prompt_only'
 * @param {string|null} worldId  当前会话所属世界 id，null 表示全局
 * @returns {string}
 */
export function applyRules(text, scope, worldId) {
  if (!_cachedRules || _cachedRules.length === 0) return text;

  const rules = _cachedRules.filter(
    (r) =>
      r.enabled &&
      r.scope === scope &&
      (r.world_id === null || r.world_id === worldId),
  );

  let result = text;
  for (const rule of rules) {
    try {
      const re = new RegExp(rule.pattern, rule.flags);
      result = result.replace(re, rule.replacement);
    } catch (err) {
      console.warn(`[regex-runner] 规则 "${rule.name}" (id=${rule.id}) 执行失败:`, err.message);
    }
  }
  return result;
}
