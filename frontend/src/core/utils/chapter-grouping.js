import { CHAPTER_MESSAGE_SIZE, resolveChapterMessageSize } from './constants.js';

/**
 * 将消息列表按章节分组（纯函数，不含副作用）。
 * 章节标题由调用方从 chapterTitles 数据中取得，此函数只负责分组。
 * @param {Array} messages  按 created_at 升序排列的消息数组
 * @param {number} [chapterTurnSize]  每章轮数；省略时使用默认 CHAPTER_TURN_SIZE
 * @returns {Array<{chapterIndex: number, messages: Array}>}
 */
export function groupMessagesIntoChapters(messages, chapterTurnSize) {
  if (!messages || messages.length === 0) return [];
  const threshold = chapterTurnSize == null ? CHAPTER_MESSAGE_SIZE : resolveChapterMessageSize(chapterTurnSize);

  const chapters = [];
  let currentChapter = null;
  let count = 0;

  for (const msg of messages) {
    const countExceeded = count > 0 && count >= threshold;

    if (!currentChapter || countExceeded) {
      const chapterIndex = chapters.length + 1;
      currentChapter = { chapterIndex, messages: [] };
      chapters.push(currentChapter);
      count = 0;
    }

    currentChapter.messages.push(msg);
    count++;
  }

  return chapters;
}
