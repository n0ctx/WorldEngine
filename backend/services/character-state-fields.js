import {
  createCharacterStateField as dbCreate,
  getCharacterStateFieldById as dbGetById,
  getCharacterStateFieldsByWorldId as dbList,
  updateCharacterStateField as dbUpdate,
  deleteCharacterStateField as dbDelete,
  reorderCharacterStateFields as dbReorder,
} from '../db/queries/character-state-fields.js';
import { getCharactersByWorldId } from '../db/queries/characters.js';
import {
  upsertCharacterStateValues,
  deleteCharacterStateValuesByWorldIdAndFieldKey,
} from '../db/queries/character-state-values.js';
import { getInitialValueJson } from './_state-field-helpers.js';
import { createStateFieldService } from './_state-field-factory.js';

const svc = createStateFieldService({
  entity: 'character_state_field',
  queries: { create: dbCreate, getById: dbGetById, list: dbList, update: dbUpdate, remove: dbDelete, reorder: dbReorder },
  onCreate(field, worldId) {
    const initialValue = getInitialValueJson(field);
    upsertCharacterStateValues(getCharactersByWorldId(worldId).map(({ id }) => ({
      characterId: id,
      fieldKey: field.field_key,
      defaultValueJson: initialValue,
    })));
  },
  onUpdateDefault({ field }) {
    const initialValue = getInitialValueJson(field);
    upsertCharacterStateValues(getCharactersByWorldId(field.world_id).map(({ id }) => ({
      characterId: id,
      fieldKey: field.field_key,
      defaultValueJson: initialValue,
    })));
  },
  onDelete(field) {
    deleteCharacterStateValuesByWorldIdAndFieldKey(field.world_id, field.field_key);
  },
});

export const {
  create: createCharacterStateField,
  list: listCharacterStateFields,
  update: updateCharacterStateField,
  remove: deleteCharacterStateField,
  reorder: reorderCharacterStateFields,
} = svc;
