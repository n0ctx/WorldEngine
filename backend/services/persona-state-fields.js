import {
  createPersonaStateField as dbCreate,
  getPersonaStateFieldById as dbGetById,
  getPersonaStateFieldsByWorldId as dbGetByWorldId,
  updatePersonaStateField as dbUpdate,
  deletePersonaStateField as dbDelete,
  reorderPersonaStateFields as dbReorder,
} from '../db/queries/persona-state-fields.js';
import { upsertPersonaStateValue, deletePersonaStateValue } from '../db/queries/persona-state-values.js';

function getInitialValueJson(field) {
  return field.default_value ?? null;
}

export function createPersonaStateField(worldId, data) {
  const field = dbCreate(worldId, data);
  // 为该 world 的 persona 初始化状态值
  upsertPersonaStateValue(worldId, field.field_key, getInitialValueJson(field));
  return field;
}

export function getPersonaStateFieldsByWorldId(worldId) {
  return dbGetByWorldId(worldId);
}

export function updatePersonaStateField(id, patch) {
  return dbUpdate(id, patch);
}

export function deletePersonaStateField(id) {
  const field = dbGetById(id);
  if (field) {
    deletePersonaStateValue(field.world_id, field.field_key);
  }
  return dbDelete(id);
}

export function reorderPersonaStateFields(worldId, orderedIds) {
  return dbReorder(worldId, orderedIds);
}
