/**
 * llm-json.js — 从 LLM 文本输出里取 JSON
 *
 * 两种口径：
 *   parseFencedJson(raw)   — 去掉思考块与首尾 ```json 围栏后严格解析，失败抛错（调用方自行降级）
 *   extractJsonObject(raw) — 去掉思考块后优先取 ```json 代码块，再取第一个 {...}，失败返回 null
 */

import { stripThinkBlocksFromText } from './turn-dialogue.js';

export function parseFencedJson(raw) {
  const stripped = stripThinkBlocksFromText(raw || '').trim();
  return JSON.parse(stripped.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim());
}

export function extractJsonObject(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const stripped = stripThinkBlocksFromText(raw).trim();
  if (!stripped) return null;
  const codeBlock = stripped.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = codeBlock ? codeBlock[1].trim() : stripped;
  const objMatch = candidate.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(objMatch ? objMatch[0] : candidate);
  } catch {
    return null;
  }
}
