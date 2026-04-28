import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  activatePersona,
  createPersona,
  deletePersona,
  getPersona,
  getPersonaById,
  listPersonas,
  updatePersona,
  updatePersonaById,
  uploadPersonaAvatar,
  uploadPersonaAvatarById,
} from '../../src/api/personas.js';

describe('personas api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('会请求 persona 详情、列表并覆盖新旧保存接口', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'persona-1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ([{ id: 'persona-1' }]) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'persona-2' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'persona-1', name: '旅者' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'persona-1', name: '旅者' }) });
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'persona-3', name: '新旅者' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'persona-1', active: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'persona-1', deleted: true }) });

    await expect(getPersona('world-1')).resolves.toEqual({ id: 'persona-1' });
    await expect(listPersonas('world-1')).resolves.toEqual([{ id: 'persona-1' }]);
    await expect(getPersonaById('persona-2')).resolves.toEqual({ id: 'persona-2' });
    await expect(updatePersona('world-1', { name: '旅者' })).resolves.toEqual({ id: 'persona-1', name: '旅者' });
    await expect(updatePersonaById('persona-1', { name: '旅者' })).resolves.toEqual({ id: 'persona-1', name: '旅者' });
    await expect(createPersona('world-1', { name: '新旅者' })).resolves.toEqual({ id: 'persona-3', name: '新旅者' });
    await expect(activatePersona('world-1', 'persona-1')).resolves.toEqual({ id: 'persona-1', active: true });
    await expect(deletePersona('persona-1')).resolves.toBeUndefined();

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/worlds/world-1/persona');
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/worlds/world-1/personas');
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/personas/persona-2');
    expect(fetch).toHaveBeenNthCalledWith(4, '/api/worlds/world-1/persona', expect.objectContaining({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '旅者' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(5, '/api/personas/persona-1', expect.objectContaining({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '旅者' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(6, '/api/worlds/world-1/personas', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: '新旅者' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(7, '/api/worlds/world-1/personas/persona-1/activate', expect.objectContaining({ method: 'PATCH' }));
    expect(fetch).toHaveBeenNthCalledWith(8, '/api/personas/persona-1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('会透传 persona 接口返回的文本错误与头像上传错误', async () => {
    fetch
      .mockResolvedValueOnce({ ok: false, text: async () => 'persona failed' })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'avatar failed' }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'avatar by id failed' }) });

    await expect(getPersona('world-2')).rejects.toThrow('persona failed');
    await expect(uploadPersonaAvatar('world-2', new File(['x'], 'persona.png'))).rejects.toThrow('avatar failed');
    await expect(uploadPersonaAvatarById('persona-2', new File(['x'], 'persona.png'))).rejects.toThrow('avatar by id failed');
  });
});
