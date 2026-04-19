import { CHAPTER_MESSAGE_SIZE, CHAPTER_TIME_GAP_MS } from './constants.js';

/**
 * 将消息列表按章节分组（纯函数，不含副作用）。
 * @param {Array} messages  按 created_at 升序排列的消息数组
 * @param {string} sessionTitle  当前会话标题（第一章用此作章节标题）
 * @returns {Array<{chapterIndex: number, title: string, messages: Array}>}
 */
export function groupMessagesIntoChapters(messages, sessionTitle) {
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
      const title = chapterIndex === 1 ? (sessionTitle || '会话进行中') : '续章';
      currentChapter = { chapterIndex, title, messages: [] };
      chapters.push(currentChapter);
      count = 0;
    }

    currentChapter.messages.push(msg);
    count++;
    prevTimestamp = ts;
  }

  return chapters;
}
