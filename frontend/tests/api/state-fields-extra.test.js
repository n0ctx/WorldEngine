import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCharacterStateField,
  deleteCharacterStateField,
  listCharacterStateFields,
  reorderCharacterStateFields,
  updateCharacterStateField,
} from '../../src/api/character-state-fields.js';
import {
  createPersonaStateField,
  deletePersonaStateField,
  listPersonaStateFields,
  reorderPersonaStateFields,
  updatePersonaStateField,
} from '../../src/api/persona-state-fields.js';
import {
  clearAllDiaries,
  createWorldStateField,
  deleteWorldStateField,
  listWorldStateFields,
  reorderWorldStateFields,
  syncDiaryTimeField,
  updateWorldStateField,
} from '../../src/api/world-state-fields.js';

describe('state fields extra api', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
  });

  it('覆盖 persona / character / world state field wrappers 以及 diary 接口', async () => {
    await listPersonaStateFields('world-1');
    await createPersonaStateField('world-1', { field_key: 'hp' });
    await updatePersonaStateField('pf-1', { label: 'HP' });
    await deletePersonaStateField('pf-1');
    await reorderPersonaStateFields('world-1', ['pf-1']);

    await listCharacterStateFields('world-1');
    await createCharacterStateField('world-1', { field_key: 'mp' });
    await updateCharacterStateField('cf-1', { label: 'MP' });
    await deleteCharacterStateField('cf-1');
    await reorderCharacterStateFields('world-1', ['cf-1']);

    await listWorldStateFields('world-1');
    await createWorldStateField('world-1', { field_key: 'weather' });
    await updateWorldStateField('wf-1', { label: '天气' });
    await deleteWorldStateField('wf-1');
    await reorderWorldStateFields('world-1', ['wf-1']);
    await syncDiaryTimeField('world-1');
    await clearAllDiaries();

    expect(fetch).toHaveBeenCalledWith('/api/worlds/world-1/persona-state-fields', expect.any(Object));
    expect(fetch).toHaveBeenCalledWith('/api/worlds/world-1/character-state-fields', expect.any(Object));
    expect(fetch).toHaveBeenCalledWith('/api/worlds/world-1/world-state-fields', expect.any(Object));
    expect(fetch).toHaveBeenCalledWith('/api/worlds/world-1/sync-diary', { method: 'POST' });
    expect(fetch).toHaveBeenCalledWith('/api/worlds/clear-all-diaries', { method: 'POST' });
  });
});
