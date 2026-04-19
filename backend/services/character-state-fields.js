import {
  createCharacterStateField as dbCreate,
  getCharacterStateFieldById as dbGetById,
  getCharacterStateFieldsByWorldId as dbList,
  updateCharacterStateField as dbUpdate,
  deleteCharacterStateField as dbDelete,
  reorderCharacterStateFields as dbReorder,
} from '../db/queries/character-state-fields.js';
import { getCharactersByWorldId } from '../db/queries/characters.js';
import { upsertCharacterStateValue, deleteCharacterStateValue } from '../db/queries/character-state-values.js';

function getInitialValueJson(field) {
  return field.default_value ?? null;
}

export function createCharacterStateField(worldId, data) {
  const field = dbCreate(worldId, data);
  const characters = getCharactersByWorldId(worldId);
  for (const character of characters) {
    upsertCharacterStateValue(character.id, field.field_key, { defaultValueJson: getInitialValueJson(field) });
  }
  return field;
}
export const getCharacterStateFieldById = (id)           => dbGetById(id);
export const listCharacterStateFields   = (worldId)      => dbList(worldId);
export const updateCharacterStateField  = (id, patch)    => dbUpdate(id, patch);
export function deleteCharacterStateField(id) {
  const field = dbGetById(id);
  if (field) {
    const characters = getCharactersByWorldId(field.world_id);
    for (const character of characters) {
      deleteCharacterStateValue(character.id, field.field_key);
    }
  }
  return dbDelete(id);
}
export const reorderCharacterStateFields = (worldId, orderedIds) => dbReorder(worldId, orderedIds);
