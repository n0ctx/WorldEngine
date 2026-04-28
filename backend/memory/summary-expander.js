/**
 * summary-expander.js — 记忆原文展开
 *
 * 对外暴露：
 *   decideExpansion({ sessionId, recalled })
 *     → Promise<string[]>  需要展开的 turn_record_id 列表（可能为空）
 *
 *   renderExpandedTurnRecords(turnRecordIds, tokenBudget)
 *     → string  可读文本块，供注入 [13] 末尾
 */

import { getSessionById } from '../db/queries/sessions.js';
import { getTurnRecordById } from '../db/queries/turn-records.js';
import { getMessagesBySessionId, getMessageById } from '../db/queries/messages.js';
import * as llm from '../llm/index.js';
import { countTokens } from '../utils/token-counter.js';
import {
  MEMORY_EXPAND_DECISION_MAX_TOKENS,
  ALL_MESSAGES_LIMIT,
} from '../utils/constants.js';
import { createLogger } from '../utils/logger.js';
import { renderBackendPrompt, loadBackendPrompt } from '../prompts/prompt-loader.js';

const log = createLogger('memory-expand');

/**
 * 通过 preflight 非流式调用，让 AI 决定需要展开哪些 turn record。
 * 独立取最近 1 轮上文（1 user + 1 assistant），不依赖外部传入的上下文。
 *
 * @param {{ sessionId: string, recalled: Array }} options
 * @returns {Promise<string[]>}  需展开的 turn_record_id 列表，失败静默返回 []
 */
export async function decideExpansion({ sessionId, recalled }) {
  if (!recalled || recalled.length === 0) return [];

  // 独立取最近 1 轮上文（1 user + 1 assistant）
  const allMessages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const lastUser = [...allMessages].reverse().find((m) => m.role === 'user');
  const lastAsst = [...allMessages].reverse().find((m) => m.role === 'assistant');
  const contextText = [
    lastAsst ? `AI：${lastAsst.content}` : '',
    lastUser ? `用户：${lastUser.content}` : '',
  ].filter(Boolean).join('\n');

  // 构建摘要列表文本
  const summaryLines = recalled.map((r) => {
    const dateStr = new Date(r.created_at).toISOString().slice(0, 10);
    const label = r.is_same_session ? '本会话' : r.session_title;
    return `- #${r.ref}（turn_record_id: ${r.turn_record_id}）【${dateStr} · ${label} · 第${r.round_index}轮】${r.content}`;
  }).join('\n');

  const messages = [
    {
      role: 'system',
      content: loadBackendPrompt('memory-expand-system.md'),
    },
    {
      role: 'user',
      content: renderBackendPrompt('memory-expand-user.md', {
        CONTEXT_TEXT: contextText,
        SUMMARY_LINES: summaryLines,
      }),
    },
  ];

  try {
    const raw = await llm.complete(messages, {
      temperature: 0,
      maxTokens: MEMORY_EXPAND_DECISION_MAX_TOKENS,
      thinking_level: null,
      configScope: 'aux',
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
    log.warn(`decideExpansion preflight 失败，降级为不展开: ${err.message}`);
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

    const userContent = getMessageById(record.user_message_id)?.content ?? '';
    const asstContent = getMessageById(record.asst_message_id)?.content ?? '';
    const originalText = [
      userContent ? `{{user}}：${userContent}` : '',
      asstContent ? `{{char}}：${asstContent}` : '',
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
