import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getPersonaStateValues,
  getPersonaStateValuesByPersonaId,
  resetPersonaStateValues,
  resetPersonaStateValuesByPersonaId,
  updatePersonaStateValue,
  updatePersonaStateValueByPersonaId,
} from '../../src/core/api/persona-state-values.js';

describe('persona state values api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('会按玩家路径读取、更新和重置状态值', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ([{ field_key: 'mood' }]) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    await expect(getPersonaStateValues('world-1')).resolves.toEqual([{ field_key: 'mood' }]);
    await expect(updatePersonaStateValue('world-1', 'mood', '"平静"')).resolves.toEqual({ ok: true });
    await expect(resetPersonaStateValues('world-1')).resolves.toEqual({ ok: true });

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/worlds/world-1/persona-state-values');
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/worlds/world-1/persona-state-values/mood', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ value_json: '"平静"' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/worlds/world-1/persona-state-values/reset', expect.objectContaining({ method: 'POST' }));
  });

  it('失败时会透传文本错误', async () => {
    fetch.mockResolvedValueOnce({ ok: false, text: async () => 'persona state failed' });
    await expect(getPersonaStateValues('world-2')).rejects.toThrow('persona state failed');
  });

  it('按 personaId 读取 / 更新状态值并在失败时透传文本', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ([{ field_key: 'mood' }]) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    await expect(getPersonaStateValuesByPersonaId('w1', 'p1')).resolves.toEqual([{ field_key: 'mood' }]);
    await expect(updatePersonaStateValueByPersonaId('w1', 'p1', 'mood', '"喜"')).resolves.toEqual({ ok: true });

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/worlds/w1/personas/p1/state-values');
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/worlds/w1/personas/p1/state-values/mood', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ value_json: '"喜"' }),
    }));

    fetch.mockResolvedValueOnce({ ok: false, text: async () => 'no persona' });
    await expect(getPersonaStateValuesByPersonaId('w1', 'p2')).rejects.toThrow('no persona');

    fetch.mockResolvedValueOnce({ ok: false, text: async () => 'patch fail' });
    await expect(updatePersonaStateValueByPersonaId('w1', 'p1', 'mood', 'x')).rejects.toThrow('patch fail');
  });

  it('resetPersonaStateValuesByPersonaId 失败时优先 body.error，否则回退状态码', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: '禁止重置' }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error('parse'); } });

    await expect(resetPersonaStateValuesByPersonaId('w1', 'p1')).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenLastCalledWith('/api/worlds/w1/personas/p1/state-values/reset', { method: 'POST' });

    await expect(resetPersonaStateValuesByPersonaId('w1', 'p1')).rejects.toThrow('禁止重置');
    await expect(resetPersonaStateValuesByPersonaId('w1', 'p1')).rejects.toThrow('重置失败：500');
  });

  it('resetPersonaStateValues（world 级）的错误兜底', async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error('parse'); } });
    await expect(resetPersonaStateValues('w1')).rejects.toThrow('重置失败：500');
  });
});
