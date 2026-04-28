import { describe, expect, it } from 'vitest';

import { CHAPTER_MESSAGE_SIZE, CHAPTER_TIME_GAP_MS } from '../../src/utils/constants.js';
import { groupMessagesIntoChapters } from '../../src/utils/chapter-grouping.js';

describe('chapter grouping', () => {
  it('空输入返回空数组，单条消息生成单章节', () => {
    expect(groupMessagesIntoChapters()).toEqual([]);
    expect(groupMessagesIntoChapters([{ id: 'm1', created_at: 10 }])).toEqual([
      { chapterIndex: 1, messages: [{ id: 'm1', created_at: 10 }] },
    ]);
  });

  it('按时间间隔和章节大小切分', () => {
    const base = 1_000;
    const messages = [
      { id: 'm1', created_at: base },
      { id: 'm2', created_at: base + 100 },
      { id: 'm3', created_at: base + 100 + CHAPTER_TIME_GAP_MS + 1 },
    ];
    expect(groupMessagesIntoChapters(messages)).toEqual([
      { chapterIndex: 1, messages: [messages[0], messages[1]] },
      { chapterIndex: 2, messages: [messages[2]] },
    ]);

    const byCount = Array.from({ length: CHAPTER_MESSAGE_SIZE + 1 }, (_, idx) => ({
      id: `c${idx}`,
      created_at: base + idx,
    }));
    const chapters = groupMessagesIntoChapters(byCount);
    expect(chapters).toHaveLength(2);
    expect(chapters[0].messages).toHaveLength(CHAPTER_MESSAGE_SIZE);
    expect(chapters[1].messages).toHaveLength(1);
  });
});
