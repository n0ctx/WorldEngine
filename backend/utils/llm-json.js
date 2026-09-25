/**
 * llm-json.js — 从 LLM 文本输出里取 JSON
 *
 * 两种口径：
 *   parseFencedJson(raw)   — 去掉思考块与首尾 ```json 围栏后严格解析，失败抛错（调用方自行降级）
 *   extractJsonObject(raw) — 去掉思考块后优先取 ```json 代码块，再取第一个 {...}，失败返回 null
 *
 * pickKnownIds(ids, knownIds) — 从 LLM 返回的 id 列表里只留已知 id，去重，最多 knownIds.length 个
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

export function pickKnownIds(ids, knownIds) {
  if (!Array.isArray(ids)) return [];
  const known = new Set(knownIds);
  return [...new Set(ids.filter((id) => typeof id === 'string' && known.has(id)))].slice(0, knownIds.length);
}
