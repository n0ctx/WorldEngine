/**
 * summarizer.js — Session Summary 和会话标题的异步生成
 */

import * as llm from '../llm/index.js';
import { getMessagesBySessionId, updateSessionTitle } from '../services/sessions.js';
import { ALL_MESSAGES_LIMIT } from '../utils/constants.js';
import { upsertSummary } from '../db/queries/session-summaries.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('summarizer');

/**
 * 生成会话摘要，存入 session_summaries 表。
 * 调用方：异步队列，优先级 1。
 * @param {string} sessionId
 */
/** 剥除 <think>...</think> 块，只保留正文 */
function stripThinkTags(text) {
  return (text || '').replace(/<think>[\s\S]*?<\/think>\n*/g, '').replace(/<think>[\s\S]*$/, '').trim();
}

export async function generateSummary(sessionId) {
  const sid = sessionId.slice(0, 8);
  log.debug(`generateSummary START  session=${sid}`);

  const messages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const dialogue = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => `${m.role === 'user' ? '用户' : 'AI'}：${stripThinkTags(m.content)}`)
    .join('\n');

  if (!dialogue) {
    log.debug(`generateSummary SKIP no dialogue  session=${sid}`);
    return;
  }

  const prompt = [
    {
      role: 'user',
      content:
        `请对以下对话内容生成一段简洁的摘要（50~100字），概括对话的主要内容、关键事件和结论。` +
        `摘要将用于后续记忆检索，请确保包含重要的人物、地点、事件等关键信息。\n\n${dialogue}`,
    },
  ];

  const summary = await llm.complete(prompt, { temperature: 0.3, maxTokens: 500 });
  if (summary) {
    upsertSummary(sessionId, summary.trim());
    log.info(`generateSummary DONE  session=${sid}  len=${summary.trim().length}`);
  }
}

/**
 * 生成会话标题，更新 sessions.title。
 * 调用方：异步队列，优先级 2，仅当 session.title 为 NULL 时才入队。
 * @param {string} sessionId
 * @returns {Promise<string|null>} 生成的标题，失败时返回 null
 */
export async function generateTitle(sessionId) {
  const sid = sessionId.slice(0, 8);
  log.debug(`generateTitle START  session=${sid}`);

  // 只取前几条消息，够用于概括即可
  const messages = getMessagesBySessionId(sessionId, 10, 0);
  const dialogue = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(0, 6)
    .map((m) => `${m.role === 'user' ? '用户' : 'AI'}：${stripThinkTags(m.content)}`)
    .join('\n');

  if (!dialogue) return null;

  const prompt = [
    {
      role: 'user',
      content:
        `根据以下对话内容，生成一个简洁的标题（不超过15字，不加引号，不加标点符号结尾）：\n\n${dialogue}`,
    },
  ];

  const raw = await llm.complete(prompt, { temperature: 0.3, maxTokens: 30 });
  if (!raw) return null;

  // 剥除 LLM 输出中可能带有的 think 标签（推理模型自身也会输出思考过程）
  const title = stripThinkTags(raw).replace(/["'"'「」『』《》【】]/g, '').slice(0, 15);
  updateSessionTitle(sessionId, title);
  log.info(`generateTitle DONE  session=${sid}  title="${title}"`);
  return title;
}
