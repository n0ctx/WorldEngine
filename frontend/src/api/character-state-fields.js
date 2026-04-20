import { createStateFieldsApi } from './state-fields-factory.js';

const api = createStateFieldsApi('character-state-fields');

export const listCharacterStateFields    = (worldId)            => api.list(worldId);
export const createCharacterStateField   = (worldId, data)      => api.create(worldId, data);
export const updateCharacterStateField   = (id, patch)          => api.update(id, patch);
export const deleteCharacterStateField   = (id)                 => api.delete(id);
export const reorderCharacterStateFields = (worldId, orderedIds) => api.reorder(worldId, orderedIds);
