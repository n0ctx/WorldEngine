import {
  createWorld as dbCreateWorld,
  getWorldById as dbGetWorldById,
  getAllWorlds as dbGetAllWorlds,
  updateWorld as dbUpdateWorld,
  deleteWorld as dbDeleteWorld,
} from '../db/queries/worlds.js';
import { runOnDelete } from '../utils/cleanup-hooks.js';
import { getWorldStateFieldsByWorldId, createWorldStateField } from '../db/queries/world-state-fields.js';
import { upsertWorldStateValue } from '../db/queries/world-state-values.js';
import { getConfig } from './config.js';
import { DIARY_TIME_FIELD_KEY, DIARY_TIME_UPDATE_INSTRUCTION } from '../utils/constants.js';
import { upsertPersona } from '../db/queries/personas.js';
import { getPersonaStateFieldsByWorldId } from '../db/queries/persona-state-fields.js';
import { upsertPersonaStateValue } from '../db/queries/persona-state-values.js';

function getInitialValueJson(field) {
  return field.default_value ?? null;
}

export function createWorld(data) {
  const world = dbCreateWorld(data);

  // 日记功能开启时，自动为新世界添加 _diary_time 时间字段（导入场景若字段已存在则跳过）
  const config = getConfig();
  const diaryEnabled = config.diary?.chat?.enabled || config.diary?.writing?.enabled;
  if (diaryEnabled) {
    const existing = getWorldStateFieldsByWorldId(world.id);
    const hasTimeField = existing.some((f) => f.field_key === DIARY_TIME_FIELD_KEY);
    if (!hasTimeField) {
      createWorldStateField(world.id, {
        field_key: DIARY_TIME_FIELD_KEY,
        label: '时间',
        type: 'text',
        update_mode: 'llm_auto',
        trigger_mode: 'every_turn',
        update_instruction: DIARY_TIME_UPDATE_INSTRUCTION,
        allow_empty: 1,
        sort_order: 0,
      });
    }
  }

  // 根据已有 world_state_fields 初始化状态值（导入场景；新建空世界时无字段，为 no-op）
  const fields = getWorldStateFieldsByWorldId(world.id);
  for (const field of fields) {
    upsertWorldStateValue(world.id, field.field_key, { defaultValueJson: getInitialValueJson(field) });
  }
  // 创建 persona 行（带 persona data 则顺带写入，否则创建空行）
  upsertPersona(world.id, {
    name: data.persona_name ?? '',
    system_prompt: data.persona_system_prompt ?? '',
  });
  // 根据已有 persona_state_fields 初始化状态值（导入场景；新建时无字段，为 no-op）
  const personaFields = getPersonaStateFieldsByWorldId(world.id);
  for (const field of personaFields) {
    upsertPersonaStateValue(world.id, field.field_key, { defaultValueJson: getInitialValueJson(field) });
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
