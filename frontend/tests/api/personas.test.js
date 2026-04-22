import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getPersona, updatePersona, uploadPersonaAvatar } from '../../src/api/personas.js';

describe('personas api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('会请求 persona 详情并用 PATCH 保存', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'persona-1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'persona-1', name: '旅者' }) });

    await expect(getPersona('world-1')).resolves.toEqual({ id: 'persona-1' });
    await expect(updatePersona('world-1', { name: '旅者' })).resolves.toEqual({ id: 'persona-1', name: '旅者' });

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/worlds/world-1/persona');
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/worlds/world-1/persona', expect.objectContaining({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '旅者' }),
    }));
  });

  it('会透传 persona 接口返回的文本错误与头像上传错误', async () => {
    fetch
      .mockResolvedValueOnce({ ok: false, text: async () => 'persona failed' })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'avatar failed' }) });

    await expect(getPersona('world-2')).rejects.toThrow('persona failed');
    await expect(uploadPersonaAvatar('world-2', new File(['x'], 'persona.png'))).rejects.toThrow('avatar failed');
  });
});
