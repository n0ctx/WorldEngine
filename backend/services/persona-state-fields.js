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
import { createStateFieldService } from './_state-field-factory.js';

const svc = createStateFieldService({
  entity: 'persona_state_field',
  queries: { create: dbCreate, getById: dbGetById, list: dbGetByWorldId, update: dbUpdate, remove: dbDelete, reorder: dbReorder },
  // persona 改默认值需要旧字段做 diff（只更新未被用户定制的行）
  needsOldFieldOnUpdate: true,
  onCreate(field, worldId) {
    const initialValue = getInitialValueJson(field);
    // 为该 world 所有 persona 各初始化一行状态值
    for (const persona of getPersonasByWorldId(worldId)) {
      upsertPersonaStateValueByPersonaId(persona.id, worldId, field.field_key, { defaultValueJson: initialValue });
    }
  },
  onUpdateDefault({ field, oldField }) {
    const oldDefaultJson = oldField ? getInitialValueJson(oldField) : null;
    const newDefaultJson = getInitialValueJson(field);
    // 只更新尚未被用户定制的行（当前值为 null 或等于旧默认值）
    updatePersonaDefaultStateValuesIfNotCustomized(field.world_id, field.field_key, oldDefaultJson, newDefaultJson);
  },
  onDelete(field) {
    // 删除该世界所有 persona 的对应状态值行
    deletePersonaStateValuesByFieldKey(field.world_id, field.field_key);
  },
});

export const createPersonaStateField = (worldId, data) => svc.create(worldId, data);
export const getPersonaStateFieldsByWorldId = (worldId) => svc.list(worldId);
export const updatePersonaStateField = (id, patch) => svc.update(id, patch);
export const deletePersonaStateField = (id) => svc.remove(id);
export const reorderPersonaStateFields = (worldId, orderedIds) => svc.reorder(worldId, orderedIds);
