import {
  createCharacterStateField as dbCreate,
  getCharacterStateFieldById as dbGetById,
  getCharacterStateFieldsByWorldId as dbList,
  updateCharacterStateField as dbUpdate,
  deleteCharacterStateField as dbDelete,
  reorderCharacterStateFields as dbReorder,
} from '../db/queries/character-state-fields.js';

export const createCharacterStateField  = (worldId, data) => dbCreate(worldId, data);
export const getCharacterStateFieldById = (id)           => dbGetById(id);
export const listCharacterStateFields   = (worldId)      => dbList(worldId);
export const updateCharacterStateField  = (id, patch)    => dbUpdate(id, patch);
export const deleteCharacterStateField  = (id)           => dbDelete(id);
export const reorderCharacterStateFields = (worldId, orderedIds) => dbReorder(worldId, orderedIds);
