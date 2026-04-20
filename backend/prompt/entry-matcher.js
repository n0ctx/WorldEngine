/**
 * Prompt 条目触发匹配
 *
 * 对外暴露：
 *   matchEntries(sessionId, entries) → Promise<Set<string>>
 *
 * 触发逻辑：
 *   1. 取最近 1 轮对话（最新 1 条 user + 1 条 assistant）构建 LLM 上文
 *   2. description 非空的条目：pre-flight llm.complete() 全量判断，返回触发编号
 *   3. 关键词兜底：对未触发的条目按 keyword_scope 扫描最近 PROMPT_ENTRY_SCAN_WINDOW 条消息
 *   4. LLM 失败时降级为纯关键词匹配
 */

import { getMessagesBySessionId } from '../db/queries/messages.js';
import * as llm from '../llm/index.js';
import {
  PROMPT_ENTRY_SCAN_WINDOW,
  PROMPT_ENTRY_LLM_MAX_TOKENS,
  ALL_MESSAGES_LIMIT,
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

  const allMessages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);

  // ── 构建 LLM pre-flight 上文（最近 1 轮：1 user + 1 assistant）────
  const lastUser = [...allMessages].reverse().find((m) => m.role === 'user');
  const lastAsst = [...allMessages].reverse().find((m) => m.role === 'assistant');
  const contextLines = [
    lastAsst ? `AI：${lastAsst.content}` : '',
    lastUser ? `用户：${lastUser.content}` : '',
  ].filter(Boolean).join('\n');

  // ── 关键词扫描文本（最近 PROMPT_ENTRY_SCAN_WINDOW 条消息）──────────
  const recentMessages = allMessages.slice(-PROMPT_ENTRY_SCAN_WINDOW);
  const userScanText  = recentMessages.filter((m) => m.role === 'user').map((m) => m.content).join('\n').toLowerCase();
  const asstScanText  = recentMessages.filter((m) => m.role === 'assistant').map((m) => m.content).join('\n').toLowerCase();

  const triggered = new Set();

  // ── LLM pre-flight 判断 ───────────────────────────────────────────
  const entriesWithDesc = entries.filter((e) => e.description && e.description.trim());

  if (entriesWithDesc.length > 0 && contextLines) {
    try {
      const descList = entriesWithDesc
        .map((e, i) => `${i + 1}. 【${e.title}】${e.description}`)
        .join('\n');

      const messages = [
        {
          role: 'system',
          content:
            '你是一个条目触发判断器。根据对话内容，判断哪些条目的触发条件已被满足，需要展开完整内容注入上下文。\n' +
            '只返回严格的 JSON 数组，包含需要触发的条目编号（从 1 开始），例如 [1, 3]。无需触发时返回 []。\n' +
            '不要包含任何其他文字，不要用 markdown 代码块包裹。',
        },
        {
          role: 'user',
          content:
            `【近期对话】\n${contextLines}\n\n` +
            `【条目触发条件】\n${descList}\n\n` +
            '请判断哪些条目需要展开完整内容？返回编号数组（JSON 格式）。',
        },
      ];

      const raw = await llm.complete(messages, {
        temperature: 0,
        maxTokens: PROMPT_ENTRY_LLM_MAX_TOKENS,
      });

      const stripped = (raw || '')
        .replace(/<think>[\s\S]*?<\/think>\n*/g, '')
        .replace(/<think>[\s\S]*$/, '')
        .trim();
      const cleaned = stripped.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      const indices = JSON.parse(cleaned);

      if (Array.isArray(indices)) {
        for (const idx of indices) {
          const entry = entriesWithDesc[idx - 1];
          if (entry) triggered.add(entry.id);
        }
      }
    } catch (err) {
      console.warn('[entry-matcher] LLM preflight 失败，降级为关键词匹配:', err.message);
    }
  }

  // ── 关键词兜底 ───────────────────────────────────────────────────
  for (const entry of entries) {
    if (triggered.has(entry.id)) continue;
    if (!entry.keywords || entry.keywords.length === 0) continue;

    const rawScope = typeof entry.keyword_scope === 'string'
      ? entry.keyword_scope.trim().toLowerCase()
      : '';
    const scopes = rawScope === 'both' || rawScope === ''
      ? new Set(['user', 'assistant'])
      : new Set(
          rawScope
            .split(',')
            .map((part) => part.trim())
            .filter((part) => part === 'user' || part === 'assistant'),
        );

    const matchedInUser = scopes.has('user')
      && entry.keywords.some((kw) => userScanText.includes(kw.toLowerCase()));
    const matchedInAssistant = scopes.has('assistant')
      && entry.keywords.some((kw) => asstScanText.includes(kw.toLowerCase()));

    if (matchedInUser || matchedInAssistant) {
      triggered.add(entry.id);
    }
  }

  return triggered;
}
