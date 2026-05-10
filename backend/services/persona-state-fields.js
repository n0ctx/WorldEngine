import {
  createPersonaStateField as dbCreate,
  getPersonaStateFieldById as dbGetById,
  getPersonaStateFieldsByWorldId as dbGetByWorldId,
  updatePersonaStateField as dbUpdate,
  deletePersonaStateField as dbDelete,
  reorderPersonaStateFields as dbReorder,
} from '../db/queries/persona-state-fields.js';
import {
  upsertPersonaStateValueByPersonaId,
  deletePersonaStateValuesByFieldKey,
  updatePersonaDefaultStateValuesIfNotCustomized,
} from '../db/queries/persona-state-values.js';
import { getPersonasByWorldId } from '../db/queries/personas.js';
import { getInitialValueJson } from './_state-field-helpers.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const log = createLogger('svc', 'green');

export function createPersonaStateField(worldId, data) {
  const field = dbCreate(worldId, data);
  const initialValue = getInitialValueJson(field);
  // 为该 world 所有 persona 各初始化一行状态值
  const personas = getPersonasByWorldId(worldId);
  for (const persona of personas) {
    upsertPersonaStateValueByPersonaId(persona.id, worldId, field.field_key, { defaultValueJson: initialValue });
  }
  log.info(`persona_state_field.create  ${formatMeta({ worldId, fieldId: field.id, fieldKey: field.field_key, type: field.type })}`);
  return field;
}

export function getPersonaStateFieldsByWorldId(worldId) {
  return dbGetByWorldId(worldId);
}

export function updatePersonaStateField(id, patch) {
  const oldField = Object.hasOwn(patch, 'default_value') ? dbGetById(id) : null;
  const field = dbUpdate(id, patch);
  if (field && Object.hasOwn(patch, 'default_value')) {
    const oldDefaultJson = oldField ? getInitialValueJson(oldField) : null;
    const newDefaultJson = getInitialValueJson(field);
    // 只更新尚未被用户定制的行（当前值为 null 或等于旧默认值）
    updatePersonaDefaultStateValuesIfNotCustomized(field.world_id, field.field_key, oldDefaultJson, newDefaultJson);
    log.info(`persona_state_field.update_default  ${formatMeta({ worldId: field.world_id, fieldId: field.id, fieldKey: field.field_key })}`);
  }
  return field;
}

export function deletePersonaStateField(id) {
  const field = dbGetById(id);
  if (field) {
    // 删除该世界所有 persona 的对应状态值行
    deletePersonaStateValuesByFieldKey(field.world_id, field.field_key);
  }
  const result = dbDelete(id);
  if (field) {
    log.info(`persona_state_field.delete  ${formatMeta({ worldId: field.world_id, fieldId: id, fieldKey: field.field_key })}`);
  }
  return result;
}

export function reorderPersonaStateFields(worldId, orderedIds) {
  return dbReorder(worldId, orderedIds);
}
