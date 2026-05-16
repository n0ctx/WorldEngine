import { describe, expect, it } from 'vitest';

import { CHAPTER_MESSAGE_SIZE, CHAPTER_TURN_SIZE } from '../../src/core/utils/constants.js';
import { groupMessagesIntoChapters } from '../../src/core/utils/chapter-grouping.js';

describe('chapter grouping', () => {
  it('空输入返回空数组，单条消息生成单章节', () => {
    expect(groupMessagesIntoChapters()).toEqual([]);
    expect(groupMessagesIntoChapters([{ id: 'm1', created_at: 10 }])).toEqual([
      { chapterIndex: 1, messages: [{ id: 'm1', created_at: 10 }] },
    ]);
  });

  it('章节阈值 = CHAPTER_TURN_SIZE * 2（user+assistant 各一条算一轮）', () => {
    expect(CHAPTER_MESSAGE_SIZE).toBe(CHAPTER_TURN_SIZE * 2);
  });

  it('按消息条数切分（仅条数触发，不再按时间间隔）', () => {
    const base = 1_000;
    const byCount = Array.from({ length: CHAPTER_MESSAGE_SIZE + 1 }, (_, idx) => ({
      id: `c${idx}`,
      created_at: base + idx,
    }));
    const chapters = groupMessagesIntoChapters(byCount);
    expect(chapters).toHaveLength(2);
    expect(chapters[0].messages).toHaveLength(CHAPTER_MESSAGE_SIZE);
    expect(chapters[1].messages).toHaveLength(1);
  });

  it('长时间间隔不再触发新章节（仅条数触发）', () => {
    const base = 1_000;
    const TWELVE_HOURS = 12 * 60 * 60 * 1000;
    const messages = [
      { id: 'm1', created_at: base },
      { id: 'm2', created_at: base + TWELVE_HOURS },
    ];
    expect(groupMessagesIntoChapters(messages)).toEqual([
      { chapterIndex: 1, messages: [messages[0], messages[1]] },
    ]);
  });

  it('chapterTurnSize 参数生效：阈值 = chapterTurnSize * 2', () => {
    const msgs = Array.from({ length: 7 }, (_, idx) => ({ id: `m${idx}`, created_at: idx }));
    // chapterTurnSize=3 ⇒ 阈值 6 条；7 条应切成 2 章（6 + 1）
    const chapters = groupMessagesIntoChapters(msgs, 3);
    expect(chapters).toHaveLength(2);
    expect(chapters[0].messages).toHaveLength(6);
    expect(chapters[1].messages).toHaveLength(1);
  });

  it('chapterTurnSize 非法值回落到默认（不会切出无意义的极小章节）', () => {
    const msgs = Array.from({ length: 4 }, (_, idx) => ({ id: `m${idx}`, created_at: idx }));
    // 0 / 负数 / NaN 都应回落到 CHAPTER_MESSAGE_SIZE（默认 40），4 条 → 单章
    expect(groupMessagesIntoChapters(msgs, 0)).toHaveLength(1);
    expect(groupMessagesIntoChapters(msgs, -5)).toHaveLength(1);
    expect(groupMessagesIntoChapters(msgs, NaN)).toHaveLength(1);
  });
});
