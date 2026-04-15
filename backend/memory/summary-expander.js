/**
 * summary-expander.js — T28 记忆原文展开
 *
 * 对外暴露：
 *   decideExpansion({ sessionId, recalled, recentMessagesText })
 *     → Promise<string[]>  需要展开的 session_id 列表（可能为空）
 *
 *   renderExpandedSessions(sessionIds, tokenBudget)
 *     → string  可读文本块，供注入 [6] 末尾
 */

import { getSessionById } from '../db/queries/sessions.js';
import { getUncompressedMessagesBySessionId } from '../db/queries/messages.js';
import * as llm from '../llm/index.js';
import { countTokens } from '../utils/token-counter.js';
import {
  MEMORY_EXPAND_DECISION_MAX_TOKENS,
  MEMORY_EXPAND_PER_SESSION_MAX_ROUNDS,
} from '../utils/constants.js';

/**
 * 通过 preflight 非流式调用，让 AI 决定需要展开哪些 session。
 *
 * @param {{ sessionId: string, recalled: Array, recentMessagesText: string }} options
 * @returns {Promise<string[]>}  需展开的 session_id 列表，失败静默返回 []
 */
export async function decideExpansion({ sessionId, recalled, recentMessagesText }) {
  if (!recalled || recalled.length === 0) return [];

  // 构建摘要列表文本
  const summaryLines = recalled.map((r) => {
    const dateStr = new Date(r.created_at).toISOString().slice(0, 10);
    return `- #${r.ref}（session_id: ${r.session_id}）【${dateStr} · ${r.session_title}】${r.content}`;
  }).join('\n');

  const messages = [
    {
      role: 'system',
      content:
        '你是一个记忆决策助手。根据用户的近期对话和历史摘要，判断哪些历史会话需要展开原文查看。\n' +
        '只返回严格的 JSON，格式：{"expand":["<session_id>",...]}，不需要展开时返回 {"expand":[]}。\n' +
        '不要包含任何其他文字，不要用 markdown 代码块包裹。',
    },
    {
      role: 'user',
      content:
        `【近期对话片段】\n${recentMessagesText}\n\n` +
        `【召回到的历史摘要】\n${summaryLines}\n\n` +
        '请判断：为了更好地回答用户，哪几条历史摘要需要展开原文？' +
        '如果摘要本身已足够，则不需要展开。返回需要展开的 session_id 列表（JSON 格式）。',
    },
  ];

  try {
    const raw = await llm.complete(messages, {
      temperature: 0,
      maxTokens: MEMORY_EXPAND_DECISION_MAX_TOKENS,
    });

    // strip 可能的 ```json 包裹
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed || !Array.isArray(parsed.expand)) return [];

    // 过滤掉不在 recalled 集合中的 id，去重
    const validIds = new Set(recalled.map((r) => r.session_id));
    const result = [...new Set(parsed.expand.filter((id) => typeof id === 'string' && validIds.has(id)))];

    // 截断最多 recalled.length 条
    return result.slice(0, recalled.length);
  } catch (err) {
    console.warn('[T28] decideExpansion preflight 失败，降级为不展开:', err.message);
    return [];
  }
}

/**
 * 将指定 sessionIds 的原始消息渲染为可读文本块，受 tokenBudget 限制。
 *
 * @param {string[]} sessionIds   需展开的 session id 列表（按优先级顺序）
 * @param {number} tokenBudget    最大 token 数
 * @returns {string}  可读文本，无命中时返回空字符串
 */
export function renderExpandedSessions(sessionIds, tokenBudget) {
  if (!sessionIds || sessionIds.length === 0) return '';

  const sections = [];
  let usedTokens = 0;

  for (const sid of sessionIds) {
    const session = getSessionById(sid);
    if (!session) continue;

    // 取未压缩消息（最多 MEMORY_EXPAND_PER_SESSION_MAX_ROUNDS * 2 条）
    const maxMsgs = MEMORY_EXPAND_PER_SESSION_MAX_ROUNDS * 2;
    const allMsgs = getUncompressedMessagesBySessionId(sid).filter(
      (m) => m.role === 'user' || m.role === 'assistant'
    );

    const truncated = allMsgs.length > maxMsgs;
    const msgs = allMsgs.slice(0, maxMsgs);

    const dateStr = new Date(session.created_at).toISOString().slice(0, 10);
    const titleStr = session.title || '未命名会话';

    const sectionLines = [`【历史对话原文 · ${dateStr} · ${titleStr}】`];
    // 若有压缩历史摘要，先展示
    if (session.compressed_context) {
      sectionLines.push(`[早期对话摘要] ${session.compressed_context}`);
    }
    for (const msg of msgs) {
      const speaker = msg.role === 'user' ? '用户' : 'AI';
      sectionLines.push(`${speaker}：${msg.content}`);
    }
    if (truncated) {
      sectionLines.push('…（后续对话略）');
    }

    const sectionText = sectionLines.join('\n');
    const sectionTokens = countTokens(sectionText);

    if (usedTokens + sectionTokens > tokenBudget) break;

    sections.push(sectionText);
    usedTokens += sectionTokens;
  }

  if (sections.length === 0) return '';

  return '[历史对话原文展开]\n\n' + sections.join('\n\n');
}
