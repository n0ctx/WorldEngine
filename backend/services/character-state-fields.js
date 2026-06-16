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
import { getInitialValueJson } from './_state-field-helpers.js';
import { createStateFieldService } from './_state-field-factory.js';

const svc = createStateFieldService({
  entity: 'character_state_field',
  queries: { create: dbCreate, getById: dbGetById, list: dbList, update: dbUpdate, remove: dbDelete, reorder: dbReorder },
  onCreate(field, worldId) {
    const initialValue = getInitialValueJson(field);
    for (const character of getCharactersByWorldId(worldId)) {
      upsertCharacterStateValue(character.id, field.field_key, { defaultValueJson: initialValue });
    }
  },
  onUpdateDefault({ field }) {
    const initialValue = getInitialValueJson(field);
    for (const character of getCharactersByWorldId(field.world_id)) {
      upsertCharacterStateValue(character.id, field.field_key, { defaultValueJson: initialValue });
    }
  },
  onDelete(field) {
    for (const character of getCharactersByWorldId(field.world_id)) {
      deleteCharacterStateValue(character.id, field.field_key);
    }
  },
});

export const createCharacterStateField = (worldId, data) => svc.create(worldId, data);
export const getCharacterStateFieldById = (id) => svc.getById(id);
export const listCharacterStateFields = (worldId) => svc.list(worldId);
export const updateCharacterStateField = (id, patch) => svc.update(id, patch);
export const deleteCharacterStateField = (id) => svc.remove(id);
export const reorderCharacterStateFields = (worldId, orderedIds) => svc.reorder(worldId, orderedIds);
