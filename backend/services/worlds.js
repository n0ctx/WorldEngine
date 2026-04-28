import {
  createWorld as dbCreateWorld,
  getWorldById as dbGetWorldById,
  getAllWorlds as dbGetAllWorlds,
  updateWorld as dbUpdateWorld,
  deleteWorld as dbDeleteWorld,
} from '../db/queries/worlds.js';
import { runOnDelete } from '../utils/cleanup-hooks.js';
import {
  getWorldStateFieldsByWorldId,
  createWorldStateField,
  updateWorldStateField,
  deleteWorldStateField,
} from '../db/queries/world-state-fields.js';
import { upsertWorldStateValue } from '../db/queries/world-state-values.js';
import { getConfig } from './config.js';
import { DIARY_TIME_FIELD_KEY, DIARY_TIME_UPDATE_INSTRUCTION, DIARY_TIME_DESCRIPTION } from '../utils/constants.js';
import { upsertPersona } from '../db/queries/personas.js';
import { getPersonaStateFieldsByWorldId } from '../db/queries/persona-state-fields.js';
import { upsertPersonaStateValue } from '../db/queries/persona-state-values.js';
import { getSessionIdsByWorldId } from '../db/queries/characters.js';
import { deleteDailyEntriesBySessionId } from '../db/queries/daily-entries.js';
import { deleteDiaryDir } from '../memory/diary-generator.js';

function getInitialValueJson(field) {
  return field.default_value ?? null;
}

/**
 * 根据当前全局日记配置，同步世界的 diary_time 状态字段。
 * - 日记开启：若字段不存在则创建；若存在但 update_mode 与当前模式不符则更新
 * - 日记关闭：若字段存在则删除
 * 调用时机：创建世界、创建会话、前端页面进入时（通过 /api/worlds/:id/sync-diary 路由）
 */
export function ensureDiaryTimeField(worldId) {
  const config = getConfig();
  const chatEnabled = config.diary?.chat?.enabled;
  const writingEnabled = config.diary?.writing?.enabled;
  const isDiaryEnabled = !!(chatEnabled || writingEnabled);

  // 优先使用 chat 模式；若仅 writing 启用则使用 writing 模式
  const dateMode = chatEnabled
    ? (config.diary.chat.date_mode ?? 'virtual')
    : (config.diary?.writing?.date_mode ?? 'virtual');

  const fields = getWorldStateFieldsByWorldId(worldId);
  const timeField = fields.find((f) => f.field_key === DIARY_TIME_FIELD_KEY);

  if (isDiaryEnabled && !timeField) {
    createWorldStateField(worldId, {
      field_key: DIARY_TIME_FIELD_KEY,
      label: '时间',
      description: DIARY_TIME_DESCRIPTION,
      type: 'text',
      update_mode: dateMode === 'real' ? 'system_rule' : 'llm_auto',
      update_instruction: dateMode === 'real' ? '' : DIARY_TIME_UPDATE_INSTRUCTION,
      allow_empty: 1,
      sort_order: 0,
      default_value: '1000年1月1日0时0分',
    });
  } else if (!isDiaryEnabled && timeField) {
    deleteWorldStateField(timeField.id);
  } else if (isDiaryEnabled && timeField) {
    const expectedMode = dateMode === 'real' ? 'system_rule' : 'llm_auto';
    const expectedInstruction = dateMode === 'real' ? '' : DIARY_TIME_UPDATE_INSTRUCTION;
    const needsUpdate =
      timeField.update_mode !== expectedMode ||
      timeField.update_instruction !== expectedInstruction ||
      timeField.description !== DIARY_TIME_DESCRIPTION ||
      timeField.sort_order !== 0;
    if (needsUpdate) {
      updateWorldStateField(timeField.id, {
        update_mode: expectedMode,
        update_instruction: expectedInstruction,
        description: DIARY_TIME_DESCRIPTION,
        sort_order: 0,
      });
    }
  }
}

export function createWorld(data) {
  const world = dbCreateWorld(data);

  // 日记时间字段同步（复用 ensureDiaryTimeField 逻辑）
  ensureDiaryTimeField(world.id);

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

/**
 * 清除所有世界所有会话的日记数据（DB 条目 + 磁盘文件）。
 * 在全局日记功能关闭时由用户确认后调用。
 */
export function clearAllDiaryData() {
  const worlds = dbGetAllWorlds();
  for (const world of worlds) {
    const sessionIds = getSessionIdsByWorldId(world.id);
    for (const sessionId of sessionIds) {
      deleteDailyEntriesBySessionId(sessionId);
      deleteDiaryDir(sessionId);
    }
  }
}
