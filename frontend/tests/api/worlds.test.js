import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorld, deleteWorld, getWorld, getWorlds, updateWorld } from '../../src/api/worlds.js';

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
});
