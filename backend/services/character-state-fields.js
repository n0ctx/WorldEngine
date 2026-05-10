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
import { createLogger, formatMeta } from '../utils/logger.js';

const log = createLogger('svc', 'green');

export function createCharacterStateField(worldId, data) {
  const field = dbCreate(worldId, data);
  const characters = getCharactersByWorldId(worldId);
  for (const character of characters) {
    upsertCharacterStateValue(character.id, field.field_key, { defaultValueJson: getInitialValueJson(field) });
  }
  log.info(`character_state_field.create  ${formatMeta({ worldId, fieldId: field.id, fieldKey: field.field_key, type: field.type })}`);
  return field;
}
export const getCharacterStateFieldById = (id)           => dbGetById(id);
export const listCharacterStateFields   = (worldId)      => dbList(worldId);
export function updateCharacterStateField(id, patch) {
  const field = dbUpdate(id, patch);
  if (field && Object.hasOwn(patch, 'default_value')) {
    const characters = getCharactersByWorldId(field.world_id);
    for (const character of characters) {
      upsertCharacterStateValue(character.id, field.field_key, { defaultValueJson: getInitialValueJson(field) });
    }
    log.info(`character_state_field.update_default  ${formatMeta({ worldId: field.world_id, fieldId: field.id, fieldKey: field.field_key })}`);
  }
  return field;
}
export function deleteCharacterStateField(id) {
  const field = dbGetById(id);
  if (field) {
    const characters = getCharactersByWorldId(field.world_id);
    for (const character of characters) {
      deleteCharacterStateValue(character.id, field.field_key);
    }
  }
  const result = dbDelete(id);
  if (field) {
    log.info(`character_state_field.delete  ${formatMeta({ worldId: field.world_id, fieldId: id, fieldKey: field.field_key })}`);
  }
  return result;
}
export const reorderCharacterStateFields = (worldId, orderedIds) => dbReorder(worldId, orderedIds);
