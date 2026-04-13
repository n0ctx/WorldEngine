/**
 * Prompt 条目触发匹配
 *
 * 对外暴露：
 *   matchEntries(sessionId, entries) → Promise<Set<string>>
 *
 * 触发逻辑：
 *   1. 取最近 PROMPT_ENTRY_SCAN_WINDOW 条消息拼成扫描文本
 *   2. 对扫描文本调用 embed() 获取查询向量
 *   3. embedding 存在：用余弦相似度匹配，超过阈值且在 TOP_K 内则触发
 *   4. 关键词兜底：对未触发的条目，检查 keywords 是否出现在扫描文本中（OR 关系，大小写不敏感子串）
 *   5. embedding 未配置时，只走关键词匹配
 */

import { getMessagesBySessionId } from '../db/queries/messages.js';
import { embed } from '../llm/embedding.js';
import { search } from '../utils/vector-store.js';
import {
  PROMPT_ENTRY_SCAN_WINDOW,
  PROMPT_ENTRY_SIMILARITY_THRESHOLD,
  PROMPT_ENTRY_TOP_K,
} from '../utils/constants.js';

/**
 * 判断哪些 Prompt 条目需要注入正文（触发）
 *
 * @param {string} sessionId
 * @param {Array}  entries  所有条目的合并列表（global + world + character，已按注入顺序排列）
 * @returns {Promise<Set<string>>}  触发条目的 id 集合
 */
export async function matchEntries(sessionId, entries) {
  if (!entries || entries.length === 0) return new Set();

  // 取最近 PROMPT_ENTRY_SCAN_WINDOW 条消息，拼成扫描文本
  const allMessages = getMessagesBySessionId(sessionId, 9999, 0);
  const recentMessages = allMessages.slice(-PROMPT_ENTRY_SCAN_WINDOW);
  const scanText = recentMessages.map((m) => m.content).join('\n');

  const triggered = new Set();

  // ── 向量匹配 ─────────────────────────────────────────────────────
  let queryVector = null;
  try {
    queryVector = await embed(scanText);
  } catch {
    // embed 失败时降级到关键词匹配，不抛出
  }

  if (queryVector) {
    const entryIds = new Set(entries.map((e) => e.id));
    // 取足量结果以覆盖向量库中属于本上下文的所有条目
    const results = search(queryVector, Math.max(entries.length * 3, 100));

    let topKCount = 0;
    for (const result of results) {
      if (result.score < PROMPT_ENTRY_SIMILARITY_THRESHOLD) break; // 结果已按 score 降序排列
      if (!entryIds.has(result.source_id)) continue;              // 不属于本次上下文
      if (topKCount >= PROMPT_ENTRY_TOP_K) break;
      triggered.add(result.source_id);
      topKCount++;
    }
  }

  // ── 关键词兜底 ───────────────────────────────────────────────────
  const scanLower = scanText.toLowerCase();
  for (const entry of entries) {
    if (triggered.has(entry.id)) continue;
    if (!entry.keywords || entry.keywords.length === 0) continue;
    const hit = entry.keywords.some((kw) => scanLower.includes(kw.toLowerCase()));
    if (hit) triggered.add(entry.id);
  }

  return triggered;
}
