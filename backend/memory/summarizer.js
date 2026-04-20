/**
 * summarizer.js — 会话标题的异步生成
 */

import * as llm from '../llm/index.js';
import { getMessagesBySessionId, updateSessionTitle } from '../services/sessions.js';
import { createLogger } from '../utils/logger.js';
import { LLM_TASK_TEMPERATURE, LLM_TITLE_MAX_TOKENS } from '../utils/constants.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';

const log = createLogger('summarizer');

/** 剥除 <think>...</think> 块，只保留正文 */
function stripThinkTags(text) {
  return (text || '').replace(/<think>[\s\S]*?<\/think>\n*/g, '').replace(/<think>[\s\S]*$/, '').trim();
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
      content: renderBackendPrompt('memory-title-generation.md', { DIALOGUE: dialogue }),
    },
  ];

  const raw = await llm.complete(prompt, { temperature: LLM_TASK_TEMPERATURE, maxTokens: LLM_TITLE_MAX_TOKENS });
  if (!raw) return null;

  // 剥除 LLM 输出中可能带有的 think 标签（推理模型自身也会输出思考过程）
  const title = stripThinkTags(raw).replace(/["'"'「」『』《》【】]/g, '').trim().slice(0, 15);
  if (!title) return null;
  updateSessionTitle(sessionId, title);
  log.info(`generateTitle DONE  session=${sid}  title="${title}"`);
  return title;
}
