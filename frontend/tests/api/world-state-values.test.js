import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getWorldStateValues, resetWorldStateValues, updateWorldStateValue } from '../../src/api/world-state-values.js';

describe('world state values api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('会按正确路径读取、更新和重置世界状态值', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ([{ field_key: 'weather' }]) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    await expect(getWorldStateValues('world-1')).resolves.toEqual([{ field_key: 'weather' }]);
    await expect(updateWorldStateValue('world-1', 'weather', '"雨"')).resolves.toEqual({ success: true });
    await expect(resetWorldStateValues('world-1')).resolves.toEqual({ success: true });

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/worlds/world-1/state-values');
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/worlds/world-1/state-values/weather', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ value_json: '"雨"' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/worlds/world-1/state-values/reset', expect.objectContaining({ method: 'POST' }));
  });

  it('更新失败时会透传错误信息', async () => {
    fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: '更新失败' }) });
    await expect(updateWorldStateValue('world-1', 'weather', '"雪"')).rejects.toThrow('更新失败');
  });
});
