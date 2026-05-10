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
import { createLogger, formatMeta } from '../utils/logger.js';

const log = createLogger('svc', 'green');

export function createWorldStateField(worldId, data) {
  const field = dbCreate(worldId, data);
  upsertWorldStateValue(worldId, field.field_key, { defaultValueJson: getInitialValueJson(field) });
  log.info(`world_state_field.create  ${formatMeta({ worldId, fieldId: field.id, fieldKey: field.field_key, type: field.type })}`);
  return field;
}
export const getWorldStateFieldById = (id)           => dbGetById(id);
export const listWorldStateFields   = (worldId)      => dbList(worldId);
export function updateWorldStateField(id, patch) {
  const field = dbUpdate(id, patch);
  if (field && Object.hasOwn(patch, 'default_value')) {
    upsertWorldStateValue(field.world_id, field.field_key, { defaultValueJson: getInitialValueJson(field) });
    log.info(`world_state_field.update_default  ${formatMeta({ worldId: field.world_id, fieldId: field.id, fieldKey: field.field_key })}`);
  }
  return field;
}
export function deleteWorldStateField(id) {
  const field = dbGetById(id);
  if (field) {
    deleteWorldStateValue(field.world_id, field.field_key);
  }
  const result = dbDelete(id);
  if (field) {
    log.info(`world_state_field.delete  ${formatMeta({ worldId: field.world_id, fieldId: id, fieldKey: field.field_key })}`);
  }
  return result;
}
export const reorderWorldStateFields = (worldId, orderedIds) => dbReorder(worldId, orderedIds);
