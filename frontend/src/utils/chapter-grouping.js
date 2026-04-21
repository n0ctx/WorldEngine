import { CHAPTER_MESSAGE_SIZE, CHAPTER_TIME_GAP_MS } from './constants.js';

/**
 * 将消息列表按章节分组（纯函数，不含副作用）。
 * 章节标题由调用方从 chapterTitles 数据中取得，此函数只负责分组。
 * @param {Array} messages  按 created_at 升序排列的消息数组
 * @returns {Array<{chapterIndex: number, messages: Array}>}
 */
export function groupMessagesIntoChapters(messages) {
  if (!messages || messages.length === 0) return [];

  const chapters = [];
  let currentChapter = null;
  let count = 0;
  let prevTimestamp = null;

  for (const msg of messages) {
    const ts = msg.created_at ?? 0;
    const timeGap = prevTimestamp != null && (ts - prevTimestamp) > CHAPTER_TIME_GAP_MS;
    const countExceeded = count > 0 && count >= CHAPTER_MESSAGE_SIZE;

    if (!currentChapter || timeGap || countExceeded) {
      const chapterIndex = chapters.length + 1;
      currentChapter = { chapterIndex, messages: [] };
      chapters.push(currentChapter);
      count = 0;
    }

    currentChapter.messages.push(msg);
    count++;
    prevTimestamp = ts;
  }

  return chapters;
}
