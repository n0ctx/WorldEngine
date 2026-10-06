/**
 * state-update-json.js — combined-state-updater 的 LLM JSON 输出解析
 *
 * 从 LLM 原始文本中剥离思考块、定位 JSON 对象、修复常见格式问题并解析为 patch 对象。
 */

import { createLogger, formatMeta } from '../utils/logger.js';
import { stripThinkBlocksFromText } from '../utils/turn-dialogue.js';

const log = createLogger('all-state');

/**
 * 补全被截断的 JSON：通过括号栈追踪未闭合的 { 和 [，在末尾追加缺失的关闭符号。
 * 仅处理缺少关闭括号的情况（LLM 输出被 maxTokens 截断时最常见）。
 */
// 部分 reasoning 模型即便已通过副模型配置关闭思考，仍可能在输出里夹带 <think>…</think>（或服务端故障重开思考）。
// 思考块里包含大量 {/} 会污染贪婪 JSON 提取，解析前先剥离做 defense-in-depth。
// 复用 turn-dialogue 的栈式剥除，避免非贪婪正则在 think 内回放字面 </think> 时提前闭合。
function stripThinkBlocks(text) {
  if (typeof text !== 'string') return text;
  return stripThinkBlocksFromText(text).trim();
}

/**
 * 去掉思考块后优先取 ```json 代码块，再取第一个 {...}；右括号缺失（输出被截断）时取到末尾，交给 repairJsonIssues 补全
 */
export function findJsonObjectText(raw) {
  const cleaned = stripThinkBlocks(raw);
  const codeBlock = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonSource = codeBlock ? codeBlock[1].trim() : cleaned;
  const match = jsonSource.match(/\{[\s\S]*\}/) || jsonSource.match(/\{[\s\S]*/);
  return match ? match[0] : null;
}

const KEY_AFTER_COMMA = /\s*,\s*"(?:[^"\\]|\\.)*"\s*:/y;

/**
 * 多写的右花括号：它关掉的对象外层不是对象（是数组或已到最外层），后面却紧跟 , "键":，
 * 说明后面的键本该留在这个对象里（如 [{"profile": {...}}, "aliases": [...]}]）。
 */
function isStrayObjectClose(text, i, stack) {
  if (stack.at(-1) !== '}' || stack.at(-2) === '}') return false;
  KEY_AFTER_COMMA.lastIndex = i + 1;
  return KEY_AFTER_COMMA.test(text);
}

/**
 * 修复常见 LLM JSON 输出问题（单遍状态机）：
 *  1. 补全截断括号（原 repairTruncatedJson 功能保留）
 *  2. 去除字符串外的尾部逗号（{"a":1,} 或 [1,2,]）
 *  3. 去除字符串外的 JavaScript 单行注释（// ...）
 *  4. 去除提前关闭对象的多余右花括号（见 isStrayObjectClose）
 *
 * 进入 inString=true 后所有修复逻辑均跳过，不会破坏字符串内容。
 */
export function repairJsonIssues(text) {
  const out = [];
  const stack = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { out.push(ch); escape = false; continue; }
    if (ch === '\\' && inString) { out.push(ch); escape = true; continue; }
    if (ch === '"') { out.push(ch); inString = !inString; continue; }
    if (inString) { out.push(ch); continue; }

    // 单行注释：跳过直到行尾
    if (ch === '/' && i + 1 < text.length && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    // 尾部逗号：下一个非空字符是 } 或 ] 时跳过
    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && (text[j] === ' ' || text[j] === '\t' || text[j] === '\n' || text[j] === '\r')) j++;
      if (text[j] === '}' || text[j] === ']') continue;
      out.push(ch);
      continue;
    }
    if (ch === '}' && isStrayObjectClose(text, i, stack)) continue;
    if (ch === '{') { out.push(ch); stack.push('}'); continue; }
    if (ch === '[') { out.push(ch); stack.push(']'); continue; }
    if (ch === '}' || ch === ']') { out.push(ch); stack.pop(); continue; }
    out.push(ch);
  }
  return out.join('') + stack.reverse().join('');
}

/**
 * 从 LLM 原始输出中提取并解析 JSON patch 对象。
 * 依次尝试：直接解析 → repairJsonIssues 修复后解析。
 * 成功返回 patch 对象；失败返回 null。
 */
export function extractJsonPatch(raw, sid) {
  try {
    const jsonStr = findJsonObjectText(raw);
    if (!jsonStr) return null;
    try {
      return JSON.parse(jsonStr);
    } catch {
      const repaired = repairJsonIssues(jsonStr);
      const result = JSON.parse(repaired);
      log.info(`JSON REPAIRED  ${formatMeta({ session: sid, appended: repaired.length - jsonStr.length })}`);
      return result;
    }
  } catch {
    return null;
  }
}
