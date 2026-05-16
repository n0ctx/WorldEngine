/**
 * chapter-detector.js — 后端章节分组算法（与前端 chapter-grouping.js 保持同步）
 *
 * 判断消息列表中最后一条 assistant 消息是否是某章节的第一条消息，
 * 若是，则表示需要为该章节生成标题。
 */

import { CHAPTER_MESSAGE_SIZE, resolveChapterMessageSize } from './constants.js';

/**
 * 将消息列表按章节分组（纯函数，算法与前端 groupMessagesIntoChapters 完全一致）。
 * @param {Array} messages  按 created_at 升序排列的消息数组
 * @param {number} [chapterTurnSize]  每章轮数；省略时使用默认 CHAPTER_TURN_SIZE
 * @returns {Array<{chapterIndex: number, startIdx: number, messages: Array}>}
 */
function groupIntoChapters(messages, chapterTurnSize) {
  if (!messages || messages.length === 0) return [];
  const threshold = chapterTurnSize == null ? CHAPTER_MESSAGE_SIZE : resolveChapterMessageSize(chapterTurnSize);

  const chapters = [];
  let currentChapter = null;
  let count = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const countExceeded = count > 0 && count >= threshold;

    if (!currentChapter || countExceeded) {
      const chapterIndex = chapters.length + 1;
      currentChapter = { chapterIndex, startIdx: i, messages: [] };
      chapters.push(currentChapter);
      count = 0;
    }

    currentChapter.messages.push(msg);
    count++;
  }

  return chapters;
}

/**
 * 返回指定章节内的全部消息（用于章节标题重新生成）。
 * @param {Array} messages
 * @param {number} chapterIndex  1-based 章节序号
 * @param {number} [chapterTurnSize]
 * @returns {Array}
 */
export function groupChapterMessages(messages, chapterIndex, chapterTurnSize) {
  const chapters = groupIntoChapters(messages, chapterTurnSize);
  const chapter = chapters.find((ch) => ch.chapterIndex === chapterIndex);
  return chapter ? chapter.messages : [];
}

/**
 * 判断消息列表最后一条 assistant 消息是否是新章节的第一条消息（触发章节标题生成的条件）。
 *
 * @param {Array} messages
 * @param {number} [chapterTurnSize]
 * @returns {{ chapterIndex: number, chapterMessages: Array } | null}
 */
export function detectNewChapter(messages, chapterTurnSize) {
  if (!messages || messages.length < 1) return null;

  let lastAsstIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAsstIdx = i;
      break;
    }
  }
  if (lastAsstIdx === -1) return null;

  const chapters = groupIntoChapters(messages, chapterTurnSize);
  if (chapters.length === 0) return null;

  const targetMsg = messages[lastAsstIdx];
  const targetChapter = chapters.find((ch) => ch.messages.some((m) => m.id === targetMsg.id));
  if (!targetChapter) return null;

  const firstAsstInChapter = targetChapter.messages.find((m) => m.role === 'assistant');
  if (!firstAsstInChapter || firstAsstInChapter.id !== targetMsg.id) return null;

  return {
    chapterIndex: targetChapter.chapterIndex,
    chapterMessages: targetChapter.messages,
  };
}
