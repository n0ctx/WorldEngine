import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCharacter,
  deleteCharacter,
  getCharacter,
  getCharactersByWorld,
  reorderCharacters,
  updateCharacter,
  uploadAvatar,
} from '../../src/api/characters.js';

describe('characters api', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
  });

  it('会发送角色 CRUD 与排序请求', async () => {
    await getCharactersByWorld('world-1');
    await getCharacter('char-1');
    await createCharacter('world-1', { name: '阿塔' });
    await updateCharacter('char-1', { name: '阿塔-新' });
    await deleteCharacter('char-1');
    await reorderCharacters([{ id: 'char-1', sort_order: 0 }]);

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/worlds/world-1/characters', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/characters/char-1', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/worlds/world-1/characters', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: '阿塔' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(4, '/api/characters/char-1', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ name: '阿塔-新' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(5, '/api/characters/char-1', expect.objectContaining({ method: 'DELETE' }));
    expect(fetch).toHaveBeenNthCalledWith(6, '/api/characters/reorder', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ items: [{ id: 'char-1', sort_order: 0 }] }),
    }));
  });

  it('头像上传失败时会透传后端错误', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: '头像过大' }),
    });

    await expect(uploadAvatar('char-1', new File(['x'], 'avatar.png'))).rejects.toThrow('头像过大');
    expect(fetch).toHaveBeenCalledWith('/api/characters/char-1/avatar', expect.objectContaining({
      method: 'POST',
      body: expect.any(FormData),
    }));
  });
});
