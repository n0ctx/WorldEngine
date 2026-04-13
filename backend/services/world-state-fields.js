import {
  createWorldStateField as dbCreate,
  getWorldStateFieldById as dbGetById,
  getWorldStateFieldsByWorldId as dbList,
  updateWorldStateField as dbUpdate,
  deleteWorldStateField as dbDelete,
  reorderWorldStateFields as dbReorder,
} from '../db/queries/world-state-fields.js';

export const createWorldStateField  = (worldId, data) => dbCreate(worldId, data);
export const getWorldStateFieldById = (id)           => dbGetById(id);
export const listWorldStateFields   = (worldId)      => dbList(worldId);
export const updateWorldStateField  = (id, patch)    => dbUpdate(id, patch);
export const deleteWorldStateField  = (id)           => dbDelete(id);
export const reorderWorldStateFields = (worldId, orderedIds) => dbReorder(worldId, orderedIds);
