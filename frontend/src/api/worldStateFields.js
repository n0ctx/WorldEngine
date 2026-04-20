import { createStateFieldsApi } from './stateFieldsFactory.js';

const api = createStateFieldsApi('world-state-fields');

export const listWorldStateFields    = (worldId)            => api.list(worldId);
export const createWorldStateField   = (worldId, data)      => api.create(worldId, data);
export const updateWorldStateField   = (id, patch)          => api.update(id, patch);
export const deleteWorldStateField   = (id)                 => api.delete(id);
export const reorderWorldStateFields = (worldId, orderedIds) => api.reorder(worldId, orderedIds);
