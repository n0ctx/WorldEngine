import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearAllDiaries,
  createWorldStateField,
  listWorldStateFields,
  reorderWorldStateFields,
  syncDiaryTimeField,
  updateWorldStateField,
} from '../../src/api/world-state-fields.js';

describe('world state fields api', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
  });

  it('会走 state field factory 的路径并触发额外同步接口', async () => {
    await listWorldStateFields('world-1');
    await createWorldStateField('world-1', { field_key: 'weather' });
    await updateWorldStateField('field-1', { label: '天气' });
    await reorderWorldStateFields('world-1', ['field-1']);
    await syncDiaryTimeField('world-1');
    await clearAllDiaries();

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/worlds/world-1/world-state-fields', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/worlds/world-1/world-state-fields', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ field_key: 'weather' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/world-state-fields/field-1', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ label: '天气' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(4, '/api/worlds/world-1/world-state-fields/reorder', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ orderedIds: ['field-1'] }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(5, '/api/worlds/world-1/sync-diary', { method: 'POST' });
    expect(fetch).toHaveBeenNthCalledWith(6, '/api/worlds/clear-all-diaries', { method: 'POST' });
  });
});
