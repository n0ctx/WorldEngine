/**
 * chapter-title-generator.js — 写作空间章节标题的 LLM 生成
 */

import * as llm from '../llm/index.js';
import { upsertChapterTitle } from '../db/queries/chapter-titles.js';
import { createLogger } from '../utils/logger.js';
import { LLM_TASK_TEMPERATURE, LLM_CHAPTER_TITLE_MAX_TOKENS } from '../utils/constants.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';

const log = createLogger('chapter-title');

function stripThinkTags(text) {
  return (text || '').replace(/<think>[\s\S]*?<\/think>\n*/g, '').replace(/<think>[\s\S]*$/, '').trim();
}

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

  const raw = await llm.complete(prompt, {
    temperature: LLM_TASK_TEMPERATURE,
    maxTokens: LLM_CHAPTER_TITLE_MAX_TOKENS,
  });
  if (!raw) return null;

  const title = stripThinkTags(raw)
    .replace(/["'"'「」『』《》【】]/g, '')
    .trim()
    .slice(0, 15);
  if (!title) return null;

  upsertChapterTitle(sessionId, chapterIndex, title, 0);
  log.info(`generateChapterTitle DONE  session=${sid}  chapter=${chapterIndex}  title="${title}"`);
  return title;
}
