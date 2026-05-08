import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getLongTermMemory, updateLongTermMemory } from '../../src/api/long-term-memory.js';

describe('long-term-memory api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('成功读取与更新长期记忆', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: '记住这件事' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    await expect(getLongTermMemory('session-1')).resolves.toEqual({ content: '记住这件事' });
    await expect(updateLongTermMemory('session-1', '新内容')).resolves.toEqual({ ok: true });

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/sessions/session-1/long-term-memory');
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/sessions/session-1/long-term-memory', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ content: '新内容' }),
    }));
  });

  it('GET 失败时按状态码抛错', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(getLongTermMemory('s1')).rejects.toThrow('getLongTermMemory failed: 500');
  });

  it('PUT 失败时按状态码抛错', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 409 });
    await expect(updateLongTermMemory('s1', 'x')).rejects.toThrow('updateLongTermMemory failed: 409');
  });
});
