import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchSessionTimeline } from '../../src/api/session-timeline.js';

describe('session timeline api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('返回 items 数组，缺省时回退为空数组', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ id: 't1' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await expect(fetchSessionTimeline('s1')).resolves.toEqual([{ id: 't1' }]);
    await expect(fetchSessionTimeline('s2')).resolves.toEqual([]);
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/sessions/s1/timeline');
  });

  it('错误响应抛出固定中文错误', async () => {
    fetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(fetchSessionTimeline('s1')).rejects.toThrow('获取时间线失败');
  });
});
