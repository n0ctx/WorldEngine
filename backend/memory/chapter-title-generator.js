/**
 * chapter-title-generator.js — 写作章节标题的 LLM 生成
 */

import { upsertChapterTitle } from '../db/queries/chapter-titles.js';
import { createLogger } from '../utils/logger.js';
import { LLM_TASK_TEMPERATURE, LLM_CHAPTER_TITLE_MAX_TOKENS } from '../utils/constants.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { generateTitleWithRetry, stripThinkTags } from './title-generation.js';

const log = createLogger('chapter-title');

/**
 * 为指定章节生成 LLM 标题，写入 chapter_titles 表（is_default=0）。
 *
 * @param {string} sessionId
 * @param {number} chapterIndex  1-based 章节序号
 * @param {Array}  chapterMessages  该章节的消息数组（已排好序）
 * @returns {Promise<string|null>}  生成的标题，失败时返回 null
 */
export async function generateChapterTitle(sessionId, chapterIndex, chapterMessages) {
  const sid = sessionId.slice(0, 8);
  log.debug(`generateChapterTitle START  session=${sid}  chapter=${chapterIndex}`);

  const dialogue = chapterMessages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(0, 6)
    .map((m) => `${m.role === 'user' ? '用户' : 'AI'}：${stripThinkTags(m.content)}`)
    .join('\n');

  if (!dialogue) return null;

  const prompt = [
    {
      role: 'user',
      content: renderBackendPrompt('writing-chapter-title-generation.md', { DIALOGUE: dialogue }),
    },
  ];
  const retryPrompt = [
    {
      role: 'user',
      content: renderBackendPrompt('writing-chapter-title-generation-retry.md', { DIALOGUE: dialogue }),
    },
  ];

  const result = await generateTitleWithRetry({
    prompts: [prompt, retryPrompt],
    temperature: LLM_TASK_TEMPERATURE,
    maxTokens: LLM_CHAPTER_TITLE_MAX_TOKENS,
    log,
    logLabel: 'generateChapterTitle',
    logMeta: `session=${sid}  chapter=${chapterIndex}`,
    conversationId: sessionId,
    configScope: 'writing-aux',
  });
  if (!result?.title) return null;

  const { title, source, attempts } = result;
  upsertChapterTitle(sessionId, chapterIndex, title, 0);
  log.info(`generateChapterTitle DONE  session=${sid}  chapter=${chapterIndex}  title="${title}"  source=${source}  attempts=${attempts}`);
  return title;
}
