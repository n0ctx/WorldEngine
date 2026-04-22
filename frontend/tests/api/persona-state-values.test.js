import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getPersonaStateValues, resetPersonaStateValues, updatePersonaStateValue } from '../../src/api/persona-state-values.js';

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
});
