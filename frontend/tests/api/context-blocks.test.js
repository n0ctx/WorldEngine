import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getContextBlockSource,
  getContextOverview,
  restoreContextBlock,
  searchContext,
  updateContextBlock,
} from '../../src/core/api/context-blocks.js';

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

describe('context-blocks api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('按会话读取、改写、恢复与检索剧情摘要', async () => {
    fetch
      .mockResolvedValueOnce(ok({ blocks: [], stats: {} }))
      .mockResolvedValueOnce(ok({ block: {}, children: [], rounds: [] }))
      .mockResolvedValueOnce(ok({ block: {}, children: [], rounds: [] }))
      .mockResolvedValueOnce(ok({ block: { id: 'b1' } }))
      .mockResolvedValueOnce(ok({ blocks: [], stats: {} }))
      .mockResolvedValueOnce(ok({ hits: [] }));

    await getContextOverview('s1');
    await getContextBlockSource('s1', 'b1');
    await getContextBlockSource('s1', 'b1', { full: true });
    await expect(updateContextBlock('s1', 'b1', { summary: '新摘要', topic: '夜袭' })).resolves.toEqual({ block: { id: 'b1' } });
    await restoreContextBlock('s1', 'b1');
    await searchContext('s1', '铜 钥匙');

    const calls = fetch.mock.calls;
    expect(calls[0][0]).toBe('/api/sessions/s1/context');
    expect(calls[1][0]).toBe('/api/sessions/s1/context/blocks/b1/source');
    expect(calls[2][0]).toBe('/api/sessions/s1/context/blocks/b1/source?full=1');
    expect(calls[3][0]).toBe('/api/sessions/s1/context/blocks/b1');
    expect(calls[3][1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ summary: '新摘要', topic: '夜袭' }) });
    expect(calls[4][1]).toMatchObject({ method: 'DELETE' });
    expect(calls[5][0]).toBe('/api/sessions/s1/context/search?q=%E9%93%9C%20%E9%92%A5%E5%8C%99');
  });

  it('失败时优先抛出后端给的错误信息', async () => {
    fetch
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: '摘要不能为空' }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error('no body'); } });
    await expect(updateContextBlock('s1', 'b1', { summary: ' ' })).rejects.toThrow('摘要不能为空');
    await expect(getContextOverview('s1')).rejects.toThrow('读取剧情摘要失败：500');
  });
});
