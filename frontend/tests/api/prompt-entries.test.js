import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createWorldEntry,
  deleteWorldEntry,
  getEntryConditions,
  listWorldEntries,
  reorderWorldEntries,
  replaceEntryConditions,
  updateWorldEntry,
} from '../../src/api/prompt-entries.js';

describe('prompt entries api', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
  });

  it('发送条目与条件请求', async () => {
    await listWorldEntries('world-1');
    await createWorldEntry('world-1', { title: '世界规则' });
    await updateWorldEntry('entry-1', { token: 0 });
    await deleteWorldEntry('entry-1');
    await reorderWorldEntries('world-1', ['entry-1']);
    await getEntryConditions('entry-1');
    await replaceEntryConditions('entry-1', [{ target_field: '世界.温度' }]);

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/worlds/world-1/entries', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/worlds/world-1/entries', expect.objectContaining({ method: 'POST' }));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/world-entries/entry-1', expect.objectContaining({ method: 'PUT' }));
    expect(fetch).toHaveBeenNthCalledWith(4, '/api/world-entries/entry-1', expect.objectContaining({ method: 'DELETE' }));
    expect(fetch).toHaveBeenNthCalledWith(5, '/api/world-entries/reorder', expect.objectContaining({ method: 'PUT' }));
    expect(fetch).toHaveBeenNthCalledWith(6, '/api/world-entries/entry-1/conditions', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(7, '/api/world-entries/entry-1/conditions', expect.objectContaining({ method: 'PUT' }));
  });
});
