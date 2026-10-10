import {
  createWorld as dbCreateWorld,
  getWorldById as dbGetWorldById,
  getAllWorlds as dbGetAllWorlds,
  updateWorld as dbUpdateWorld,
  deleteWorld as dbDeleteWorld,
  reorderWorlds as dbReorderWorlds,
} from '../db/queries/worlds.js';
import { runOnDelete } from '../utils/cleanup-hooks.js';
import {
  getWorldStateFieldsByWorldId,
  createWorldStateField,
} from '../db/queries/world-state-fields.js';
import { upsertWorldStateValue } from '../db/queries/world-state-values.js';
import { upsertPersona } from '../db/queries/personas.js';
import { getAllWorldSessionIds } from '../db/queries/characters.js';
import { deleteDailyEntriesBySessionIds } from '../db/queries/daily-entries.js';
import { deleteDiaryDir } from '../memory/diary-generator.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import { DEFAULT_WORLD_STATE_FIELDS } from '../utils/default-state-fields.js';
import { pickSamplingOverrides } from '../utils/constants.js';

const log = createLogger('svc', 'green');

// 接口收 sampling 对象，落库前规整成只含已设置项的 sampling_json；不接受直接写 sampling_json
function withSamplingJson({ sampling, sampling_json: _raw, ...rest }) {
  return sampling === undefined ? rest : { ...rest, sampling_json: JSON.stringify(pickSamplingOverrides(sampling)) };
}

function getInitialValueJson(field) {
  return field.default_value ?? null;
}

export function createWorld(data) {
  const world = dbCreateWorld(withSamplingJson(data));

  // 新建世界种下默认世界层状态字段，让用户不必每个世界重设。玩家层/角色层不预设，由用户按需创建。
  // 落库后就是普通字段，用户可改可删。只在 createWorld 里种，不影响已存在的世界。
  // guard-allow(perf-shape): 新建世界时按固定的默认字段表逐个种字段，条数有固定小上限
  for (const field of DEFAULT_WORLD_STATE_FIELDS) {
    createWorldStateField(world.id, field);
  }

  // 根据已有 world_state_fields 初始化状态值（含上面新种下的默认字段）
  // guard-allow(perf-shape): 新建世界只执行一次，字段刚由上面的默认表种下
  const fields = getWorldStateFieldsByWorldId(world.id);
  for (const field of fields) {
    upsertWorldStateValue(world.id, field.field_key, { defaultValueJson: getInitialValueJson(field) });
  }
  // 创建 persona 行（带 persona data 则顺带写入，否则创建空行）
  upsertPersona(world.id, {
    name: data.persona_name ?? '',
    system_prompt: data.persona_system_prompt ?? '',
  });
  log.info(`world.create  ${formatMeta({ worldId: world.id, name: world.name })}`);
  return world;
}

export function getWorldById(id) {
  return dbGetWorldById(id);
}

export function getAllWorlds() {
  return dbGetAllWorlds();
}

export function updateWorld(id, patch) {
  const updated = dbUpdateWorld(id, withSamplingJson(patch));
  if (updated) {
    log.info(`world.update  ${formatMeta({ worldId: id, fields: Object.keys(patch) })}`);
  }
  return updated;
}

export function reorderWorlds(items) {
  return dbReorderWorlds(items);
}

export async function deleteWorld(id) {
  const existing = dbGetWorldById(id);
  await runOnDelete('world', id);
  const result = dbDeleteWorld(id);
  log.info(`world.delete  ${formatMeta({ worldId: id, name: existing?.name })}`);
  return result;
}

/**
 * 清除所有世界所有会话的日记数据（DB 条目 + 磁盘文件）。
 * 在全局日记功能关闭时由用户确认后调用。
 */
export function clearAllDiaryData() {
  const sessionIds = getAllWorldSessionIds();
  deleteDailyEntriesBySessionIds(sessionIds);
  for (const sessionId of sessionIds) deleteDiaryDir(sessionId);
}
