import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getCharacterStateValues, resetCharacterStateValues, updateCharacterStateValue } from '../../src/core/api/character-state-values.js';

describe('character state values api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('会按角色路径读取、更新和重置状态值', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ([{ field_key: 'hp' }]) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    await expect(getCharacterStateValues('char-1')).resolves.toEqual([{ field_key: 'hp' }]);
    await expect(updateCharacterStateValue('char-1', 'hp', '10')).resolves.toEqual({ success: true });
    await expect(resetCharacterStateValues('char-1')).resolves.toEqual({ success: true });

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/characters/char-1/state-values');
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/characters/char-1/state-values/hp', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ value_json: '10' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/characters/char-1/state-values/reset', expect.objectContaining({ method: 'POST' }));
  });

  it('GET / PATCH / reset 失败时优先 body.error，body 解析失败回退状态码', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: '不存在' }) });
    await expect(getCharacterStateValues('c1')).rejects.toThrow('不存在');

    fetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error('parse'); } });
    await expect(updateCharacterStateValue('c1', 'hp', '0')).rejects.toThrow('请求失败：500');

    fetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error('parse'); } });
    await expect(resetCharacterStateValues('c1')).rejects.toThrow('重置失败：500');
  });
});
