/**
 * chapter-detector.js — 后端章节分组算法（与前端 chapter-grouping.js 保持同步）
 *
 * 判断消息列表中最后一条 assistant 消息是否是某章节的第一条消息，
 * 若是，则表示需要为该章节生成标题。
 */

import { CHAPTER_MESSAGE_SIZE, CHAPTER_TIME_GAP_MS } from './constants.js';

/**
 * 将消息列表按章节分组（纯函数，算法与前端 groupMessagesIntoChapters 完全一致）。
 * @param {Array} messages  按 created_at 升序排列的消息数组
 * @returns {Array<{chapterIndex: number, startIdx: number, messages: Array}>}
 */
function groupIntoChapters(messages) {
  if (!messages || messages.length === 0) return [];

  const chapters = [];
  let currentChapter = null;
  let count = 0;
  let prevTimestamp = null;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const ts = msg.created_at ?? 0;
    const timeGap = prevTimestamp != null && (ts - prevTimestamp) > CHAPTER_TIME_GAP_MS;
    const countExceeded = count > 0 && count >= CHAPTER_MESSAGE_SIZE;

    if (!currentChapter || timeGap || countExceeded) {
      const chapterIndex = chapters.length + 1;
      currentChapter = { chapterIndex, startIdx: i, messages: [] };
      chapters.push(currentChapter);
      count = 0;
    }

    currentChapter.messages.push(msg);
    count++;
    prevTimestamp = ts;
  }

  return chapters;
}

/**
 * 返回指定章节内的全部消息（用于章节标题重新生成）。
 * @param {Array} messages  按 created_at 升序排列的全部消息数组
 * @param {number} chapterIndex  1-based 章节序号
 * @returns {Array}
 */
export function groupChapterMessages(messages, chapterIndex) {
  const chapters = groupIntoChapters(messages);
  const chapter = chapters.find((ch) => ch.chapterIndex === chapterIndex);
  return chapter ? chapter.messages : [];
}

/**
 * 判断消息列表最后一条 assistant 消息是否是新章节的第一条消息（触发章节标题生成的条件）。
 *
 * 触发条件：
 * 1. 最后一条 assistant 消息是某章节的第一条消息（该章节刚刚出现的第一轮 AI 回复）
 * 2. 该章节在 chapter_titles 中尚无记录（由调用方负责检查）
 *
 * @param {Array} messages  按 created_at 升序排列的全部消息数组
 * @returns {{ chapterIndex: number, chapterMessages: Array } | null}
 *   若触发新章节，返回章节信息；否则返回 null
 */
export function detectNewChapter(messages) {
  if (!messages || messages.length < 1) return null;

  // 找最后一条 assistant 消息
  let lastAsstIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      lastAsstIdx = i;
      break;
    }
  }
  if (lastAsstIdx === -1) return null;

  const chapters = groupIntoChapters(messages);
  if (chapters.length === 0) return null;

  // 找最后一条 assistant 消息所在章节
  const targetMsg = messages[lastAsstIdx];
  const targetChapter = chapters.find((ch) => ch.messages.some((m) => m.id === targetMsg.id));
  if (!targetChapter) return null;

  // 判断该 assistant 消息是否是该章节的第一条 assistant 消息
  const firstAsstInChapter = targetChapter.messages.find((m) => m.role === 'assistant');
  if (!firstAsstInChapter || firstAsstInChapter.id !== targetMsg.id) return null;

  return {
    chapterIndex: targetChapter.chapterIndex,
    chapterMessages: targetChapter.messages,
  };
}
