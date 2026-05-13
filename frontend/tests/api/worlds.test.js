import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createWorld,
  deleteWorld,
  getWorld,
  getWorlds,
  reorderWorlds,
  updateWorld,
  uploadWorldCover,
} from '../../src/core/api/worlds.js';

describe('worlds api', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
  });

  it('会用正确的 method、path 和 body 调用世界接口', async () => {
    await getWorlds();
    await getWorld('world-1');
    await createWorld({ name: '群星海' });
    await updateWorld('world-1', { name: '余烬城' });
    await deleteWorld('world-1');

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/worlds', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/worlds/world-1', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/worlds', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: '群星海' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(4, '/api/worlds/world-1', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ name: '余烬城' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(5, '/api/worlds/world-1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('reorderWorlds 会 PUT 到 /reorder 并带上 items', async () => {
    await reorderWorlds([{ id: 'a', sort_order: 0 }]);
    expect(fetch).toHaveBeenCalledWith('/api/worlds/reorder', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ items: [{ id: 'a', sort_order: 0 }] }),
    }));
  });

  it('reorderWorlds 失败时优先抛 body.error，否则带状态码', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: '排序失败' }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error('parse error'); } });
    await expect(reorderWorlds([])).rejects.toThrow('排序失败');
    await expect(reorderWorlds([])).rejects.toThrow('请求失败：500');
  });

  it('uploadWorldCover 用 FormData POST 并返回 JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ cover_url: '/x.png' }) });
    const file = new Blob(['xxx'], { type: 'image/png' });
    await expect(uploadWorldCover('w1', file)).resolves.toEqual({ cover_url: '/x.png' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/worlds/w1/cover');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const sent = init.body.get('cover');
    expect(sent).toBeTruthy();
    expect(sent.size).toBe(file.size);
  });

  it('uploadWorldCover 失败时优先 body.error，body 解析失败回退到状态码', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 415, json: async () => ({ error: '不是图片' }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error('boom'); } });
    const file = new Blob(['x']);
    await expect(uploadWorldCover('w1', file)).rejects.toThrow('不是图片');
    await expect(uploadWorldCover('w1', file)).rejects.toThrow('上传失败：500');
  });
});
