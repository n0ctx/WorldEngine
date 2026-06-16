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
import { createStateFieldService } from './_state-field-factory.js';

const svc = createStateFieldService({
  entity: 'world_state_field',
  queries: { create: dbCreate, getById: dbGetById, list: dbList, update: dbUpdate, remove: dbDelete, reorder: dbReorder },
  onCreate(field, worldId) {
    upsertWorldStateValue(worldId, field.field_key, { defaultValueJson: getInitialValueJson(field) });
  },
  onUpdateDefault({ field }) {
    upsertWorldStateValue(field.world_id, field.field_key, { defaultValueJson: getInitialValueJson(field) });
  },
  onDelete(field) {
    deleteWorldStateValue(field.world_id, field.field_key);
  },
});

export const createWorldStateField = (worldId, data) => svc.create(worldId, data);
export const getWorldStateFieldById = (id) => svc.getById(id);
export const listWorldStateFields = (worldId) => svc.list(worldId);
export const updateWorldStateField = (id, patch) => svc.update(id, patch);
export const deleteWorldStateField = (id) => svc.remove(id);
export const reorderWorldStateFields = (worldId, orderedIds) => svc.reorder(worldId, orderedIds);
