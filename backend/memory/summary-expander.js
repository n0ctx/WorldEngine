/**
 * summary-expander.js — 记忆原文展开
 *
 * 对外暴露：
 *   decideExpansion({ sessionId, recalled, recentMessagesText })
 *     → Promise<string[]>  需要展开的 turn_record_id 列表（可能为空）
 *
 *   renderExpandedTurnRecords(turnRecordIds, tokenBudget)
 *     → string  可读文本块，供注入 [13] 末尾
 */

import { getSessionById } from '../db/queries/sessions.js';
import { getTurnRecordById } from '../db/queries/turn-records.js';
import * as llm from '../llm/index.js';
import { countTokens } from '../utils/token-counter.js';
import { stripAsstContext, stripUserContext } from '../utils/turn-dialogue.js';
import {
  MEMORY_EXPAND_DECISION_MAX_TOKENS,
} from '../utils/constants.js';

/**
 * 通过 preflight 非流式调用，让 AI 决定需要展开哪些 turn record。
 *
 * @param {{ sessionId: string, recalled: Array, recentMessagesText: string }} options
 * @returns {Promise<string[]>}  需展开的 turn_record_id 列表，失败静默返回 []
 */
export async function decideExpansion({ sessionId, recalled, recentMessagesText }) {
  if (!recalled || recalled.length === 0) return [];

  // 构建摘要列表文本
  const summaryLines = recalled.map((r) => {
    const dateStr = new Date(r.created_at).toISOString().slice(0, 10);
    const label = r.is_same_session ? '本会话' : r.session_title;
    return `- #${r.ref}（turn_record_id: ${r.turn_record_id}）【${dateStr} · ${label} · 第${r.round_index}轮】${r.content}`;
  }).join('\n');

  const messages = [
    {
      role: 'system',
      content:
        '你是一个记忆决策助手。根据用户的近期对话和历史摘要，判断哪些历史轮次需要展开原文查看。\n' +
        '只返回严格的 JSON，格式：{"expand":["<turn_record_id>",...]}，不需要展开时返回 {"expand":[]}。\n' +
        '不要包含任何其他文字，不要用 markdown 代码块包裹。',
    },
    {
      role: 'user',
      content:
        `【近期对话片段】\n${recentMessagesText}\n\n` +
        `【召回到的历史摘要】\n${summaryLines}\n\n` +
        '请判断：为了更好地回答用户，哪几条历史摘要需要展开原文？' +
        '如果摘要本身已足够，则不需要展开。返回需要展开的 turn_record_id 列表（JSON 格式）。',
    },
  ];

  try {
    const raw = await llm.complete(messages, {
      temperature: 0,
      maxTokens: MEMORY_EXPAND_DECISION_MAX_TOKENS,
    });

    // 剥除 <think>...</think> 推理链，再去 ```json 包裹
    const stripped = (raw || '')
      .replace(/<think>[\s\S]*?<\/think>\n*/g, '')
      .replace(/<think>[\s\S]*$/, '')
      .trim();
    const cleaned = stripped.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed || !Array.isArray(parsed.expand)) return [];

    // 过滤掉不在 recalled 集合中的 id，去重
    const validIds = new Set(recalled.map((r) => r.turn_record_id));
    const result = [...new Set(parsed.expand.filter((id) => typeof id === 'string' && validIds.has(id)))];

    return result.slice(0, recalled.length);
  } catch (err) {
    console.warn('[memory-expand] decideExpansion preflight 失败，降级为不展开:', err.message);
    return [];
  }
}

/**
 * 将指定 turn_record_id 列表对应的原文渲染为可读文本块，受 tokenBudget 限制。
 * 每条 turn record 仅渲染纯对话原文；旧数据中的状态快照会在这里被剥离。
 *
 * @param {string[]} turnRecordIds  需展开的 turn_record_id 列表（按优先级顺序）
 * @param {number}   tokenBudget    最大 token 数
 * @returns {string}  可读文本，无命中时返回空字符串
 */
export function renderExpandedTurnRecords(turnRecordIds, tokenBudget) {
  if (!turnRecordIds || turnRecordIds.length === 0) return '';

  const sections = [];
  let usedTokens = 0;

  for (const rid of turnRecordIds) {
    const record = getTurnRecordById(rid);
    if (!record) continue;

    const session = getSessionById(record.session_id);
    const dateStr = new Date(record.created_at).toISOString().slice(0, 10);
    const titleStr = session?.title || '未命名会话';

    const originalText = [
      record.user_context ? `{{user}}：${stripUserContext(record.user_context)}` : '',
      record.asst_context ? `{{char}}：${stripAsstContext(record.asst_context)}` : '',
    ].filter(Boolean).join('\n\n');
    const sectionText = `【历史对话原文 · ${dateStr} · ${titleStr} · 第${record.round_index}轮】\n${originalText}`;
    const sectionTokens = countTokens(sectionText);

    if (usedTokens + sectionTokens > tokenBudget) break;

    sections.push(sectionText);
    usedTokens += sectionTokens;
  }

  if (sections.length === 0) return '';

  return '[历史对话原文展开]\n\n' + sections.join('\n\n');
}
