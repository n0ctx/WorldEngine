/**
 * summarizer.js — 会话标题的异步生成
 */

import * as llm from '../llm/index.js';
import { getMessagesBySessionId, updateSessionTitle } from '../services/sessions.js';
import { createLogger } from '../utils/logger.js';
import { LLM_TASK_TEMPERATURE, LLM_TITLE_MAX_TOKENS } from '../utils/constants.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { generateTitleWithRetry, stripThinkTags } from './title-generation.js';
import { resolveAuxScope } from '../utils/aux-scope.js';

const log = createLogger('summarizer');

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
  const retryPrompt = [
    {
      role: 'user',
      content: renderBackendPrompt('memory-title-generation-retry.md', { DIALOGUE: dialogue }),
    },
  ];

  const result = await generateTitleWithRetry({
    prompts: [prompt, retryPrompt],
    maxTokens: LLM_TITLE_MAX_TOKENS,
    temperature: LLM_TASK_TEMPERATURE,
    log,
    logLabel: 'generateTitle',
    logMeta: `session=${sid}`,
    conversationId: sessionId,
    configScope: resolveAuxScope(sessionId),
  });
  if (!result?.title) return null;

  const { title, source, attempts } = result;
  updateSessionTitle(sessionId, title);
  log.info(`generateTitle DONE  session=${sid}  title="${title}"  source=${source}  attempts=${attempts}`);
  return title;
}
