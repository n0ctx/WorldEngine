import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getChapterTitles, retitleChapter, updateChapterTitle } from '../../src/api/chapter-titles.js';

describe('chapter titles api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('获取、编辑和重生成章节标题', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ([{ chapter_index: 1, title: '第一章' }]) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ title: '新标题' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ title: 'AI 标题' }) });

    await expect(getChapterTitles('world-1', 'session-1')).resolves.toEqual([{ chapter_index: 1, title: '第一章' }]);
    await expect(updateChapterTitle('world-1', 'session-1', 2, '新标题')).resolves.toEqual({ title: '新标题' });
    await expect(retitleChapter('world-1', 'session-1', 2)).resolves.toEqual({ title: 'AI 标题' });
  });

  it('错误时透传响应文本', async () => {
    fetch.mockResolvedValueOnce({ ok: false, text: async () => 'chapter failed' });
    await expect(getChapterTitles('world-1', 'session-1')).rejects.toThrow('chapter failed');
  });
});
