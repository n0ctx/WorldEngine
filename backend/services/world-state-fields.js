import {
  createWorldStateField as dbCreate,
  getWorldStateFieldById as dbGetById,
  getWorldStateFieldsByWorldId as dbList,
  updateWorldStateField as dbUpdate,
  deleteWorldStateField as dbDelete,
  reorderWorldStateFields as dbReorder,
} from '../db/queries/world-state-fields.js';
import { upsertWorldStateValue, deleteWorldStateValue } from '../db/queries/world-state-values.js';
import { getInitialValueJson } from './_state-field-helpers.js';

export function createWorldStateField(worldId, data) {
  const field = dbCreate(worldId, data);
  upsertWorldStateValue(worldId, field.field_key, { defaultValueJson: getInitialValueJson(field) });
  return field;
}
export const getWorldStateFieldById = (id)           => dbGetById(id);
export const listWorldStateFields   = (worldId)      => dbList(worldId);
export function updateWorldStateField(id, patch) {
  const field = dbUpdate(id, patch);
  if (field && Object.hasOwn(patch, 'default_value')) {
    upsertWorldStateValue(field.world_id, field.field_key, { defaultValueJson: getInitialValueJson(field) });
  }
  return field;
}
export function deleteWorldStateField(id) {
  const field = dbGetById(id);
  if (field) {
    deleteWorldStateValue(field.world_id, field.field_key);
  }
  return dbDelete(id);
}
export const reorderWorldStateFields = (worldId, orderedIds) => dbReorder(worldId, orderedIds);
