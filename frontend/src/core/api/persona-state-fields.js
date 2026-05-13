import { createStateFieldsApi } from './state-fields-factory.js';

const api = createStateFieldsApi('persona-state-fields');

export const listPersonaStateFields    = (worldId)            => api.list(worldId);
export const createPersonaStateField   = (worldId, data)      => api.create(worldId, data);
export const updatePersonaStateField   = (id, patch)          => api.update(id, patch);
export const deletePersonaStateField   = (id)                 => api.delete(id);
export const reorderPersonaStateFields = (worldId, orderedIds) => api.reorder(worldId, orderedIds);
