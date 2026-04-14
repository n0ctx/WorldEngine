import {
  createWorld as dbCreateWorld,
  getWorldById as dbGetWorldById,
  getAllWorlds as dbGetAllWorlds,
  updateWorld as dbUpdateWorld,
  deleteWorld as dbDeleteWorld,
} from '../db/queries/worlds.js';
import { runOnDelete } from '../utils/cleanup-hooks.js';
import { getWorldStateFieldsByWorldId } from '../db/queries/world-state-fields.js';
import { upsertWorldStateValue } from '../db/queries/world-state-values.js';
import { upsertPersona } from '../db/queries/personas.js';
import { getPersonaStateFieldsByWorldId } from '../db/queries/persona-state-fields.js';
import { upsertPersonaStateValue } from '../db/queries/persona-state-values.js';

function getInitialValueJson(field) {
  if (field.default_value != null) return field.default_value;
  switch (field.type) {
    case 'text':    return JSON.stringify('');
    case 'number':  return JSON.stringify(0);
    case 'boolean': return JSON.stringify(false);
    case 'enum': {
      const opts = field.enum_options;
      return (Array.isArray(opts) && opts.length > 0) ? JSON.stringify(opts[0]) : null;
    }
    default:        return null;
  }
}

export function createWorld(data) {
  const world = dbCreateWorld(data);
  // 根据已有 world_state_fields 初始化状态值（导入场景；新建空世界时无字段，为 no-op）
  const fields = getWorldStateFieldsByWorldId(world.id);
  for (const field of fields) {
    upsertWorldStateValue(world.id, field.field_key, getInitialValueJson(field));
  }
  // 创建 persona 行（带 persona data 则顺带写入，否则创建空行）
  upsertPersona(world.id, {
    name: data.persona_name ?? '',
    system_prompt: data.persona_system_prompt ?? '',
  });
  // 根据已有 persona_state_fields 初始化状态值（导入场景；新建时无字段，为 no-op）
  const personaFields = getPersonaStateFieldsByWorldId(world.id);
  for (const field of personaFields) {
    upsertPersonaStateValue(world.id, field.field_key, getInitialValueJson(field));
  }
  return world;
}

export function getWorldById(id) {
  return dbGetWorldById(id);
}

export function getAllWorlds() {
  return dbGetAllWorlds();
}

export function updateWorld(id, patch) {
  return dbUpdateWorld(id, patch);
}

export async function deleteWorld(id) {
  await runOnDelete('world', id);
  return dbDeleteWorld(id);
}
