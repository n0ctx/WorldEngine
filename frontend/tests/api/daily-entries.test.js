import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchDailyEntries, fetchDiaryContent } from '../../src/api/daily-entries.js';

describe('daily entries api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('会读取日记列表与正文，并编码 query path', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ date_str: '2026-04-22' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: '# diary' }) });

    await expect(fetchDailyEntries('session-1')).resolves.toEqual([{ date_str: '2026-04-22' }]);
    await expect(fetchDiaryContent('session-1', '2026/04/22')).resolves.toBe('# diary');

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/sessions/session-1/daily-entries');
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/sessions/session-1/daily-entries/2026%2F04%2F22');
  });

  it('列表失败时会透传文本错误', async () => {
    fetch.mockResolvedValueOnce({ ok: false, text: async () => 'daily failed' });
    await expect(fetchDailyEntries('session-1')).rejects.toThrow('daily failed');
  });
});
