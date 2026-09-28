import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMiddleSummary, updateMiddleSummary } from '../../src/core/api/middle-summary.js';

describe('middle-summary api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('成功读取与更新剧情摘要', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: '记住这件事', coveredTo: 12 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: '新内容' }) });

    await expect(getMiddleSummary('session-1')).resolves.toEqual({ content: '记住这件事', coveredTo: 12 });
    await expect(updateMiddleSummary('session-1', '新内容')).resolves.toEqual({ content: '新内容' });

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/sessions/session-1/middle-summary');
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/sessions/session-1/middle-summary', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ content: '新内容' }),
    }));
  });

  it('GET 失败时按状态码抛错', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(getMiddleSummary('s1')).rejects.toThrow('getMiddleSummary failed: 500');
  });

  it('PUT 失败时按状态码抛错（会话尚无剧情记录返回 409）', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 409 });
    await expect(updateMiddleSummary('s1', 'x')).rejects.toThrow('updateMiddleSummary failed: 409');
  });
});
