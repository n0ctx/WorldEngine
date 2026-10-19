/**
 * state-update-write.js — combined-state-updater 的 patch 写入
 *
 * 校验 LLM 返回的 patch，超限字段压缩后，把世界 / 角色 / 玩家状态、状态记忆、在场名单、NPC 字段
 * 与本轮没写入的改动在同一事务里写入。
 */

import { upsertSessionWorldStateValues } from '../db/queries/session-world-state-values.js';
import { upsertSessionCharacterStateValues } from '../db/queries/session-character-state-values.js';
import { upsertSessionPersonaStateValues } from '../db/queries/session-persona-state-values.js';
import { upsertStateUpdateRejections } from '../db/queries/state-memory.js';
import { withSessionStateTransaction } from '../db/queries/session-state-batch.js';
import { createLogger, formatMeta, previewText } from '../utils/logger.js';
import { validateValue, resolveListPatch } from '../utils/state-field-validate.js';
import { compressOverLimitFields } from './state-update-compress.js';
import { applyStateMemoryOps, applyPresence, applyEntityFields } from './state-memory-apply.js';
import { describeStateUpdateRejections } from './state-update-rejections.js';

const log = createLogger('all-state');

/**
 * 将 LLM 返回的 patch 对象写入会话状态（校验 + upsert）。
 * @param {object[]} activeFields  本次活跃字段列表（用于 fieldMap 构建和校验）
 * @param {*}        patchData     patch 对象中对应此实体的子对象；非 object 时直接跳过
 * @param {Function} upsertFn      (key: string, valueJson: string|null) => void
 * @param {string}   logLabel      日志前缀（如 `world="xxx"`）
 * @returns {object[]} 校验未通过而丢弃的字段
 */
/**
 * 取某 table 字段的旧「有效值」（运行时值优先，回退默认值）并解析为对象。
 * 用于列级 merge：返回 null 表示无可用旧值（首次写入，照常整体写）。
 */
function parseOldTableValue(cur, field) {
  if (!cur) return null;
  const json = cur.runtimeValueJson ?? cur.defaultValueJson;
  if (json == null) return null;
  let obj = json;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  // 只保留 schema 仍定义的数值列，避免把已删除列或脏值带回
  const cols = Array.isArray(field.table_columns) ? field.table_columns : [];
  const out = {};
  for (const col of cols) {
    if (!col || typeof col.key !== 'string' || !(col.key in obj)) continue;
    const num = typeof obj[col.key] === 'number' ? obj[col.key] : Number(obj[col.key]);
    if (isFinite(num)) out[col.key] = num;
  }
  return Object.keys(out).length ? out : null;
}

function applyStatePatch(activeFields, patchData, upsertFn, logLabel, valueMap = null) {
  if (!patchData || typeof patchData !== 'object') return [];
  const fieldMap = Object.fromEntries(activeFields.map((f) => [f.field_key, f]));
  const updated = [];
  const dropped = [];
  for (const [key, rawValue] of Object.entries(patchData)) {
    const field = fieldMap[key];
    if (!field) continue;
    // list 字段的 {add, remove} 按旧有效值合成完整列表，新增后超过上限时由校验保留最新的条目
    const cur = valueMap?.[key] ?? { defaultValueJson: field.default_value };
    let validated = validateValue(resolveListPatch(rawValue, field, cur.runtimeValueJson ?? cur.defaultValueJson), field);
    if (validated === undefined) {
      // 诊断：LLM 输出了该字段但校验失败被丢弃（table/格式问题排查用）
      log.warn(`DROP  ${logLabel}  ${formatMeta({ key, type: field.type, raw: previewText(JSON.stringify(rawValue)) })}`);
      dropped.push(field);
      continue;
    }
    // table 字段做列级 merge：模型只回了变化的列时，未提及的列保留旧有效值，
    // 避免「抄错/漏写一列」把整张表冲回默认或残缺。
    if (field.type === 'table' && validated && typeof validated === 'object') {
      const old = parseOldTableValue(valueMap?.[key], field);
      if (old) validated = { ...old, ...validated };
    }
    const valueJson = validated === null ? null : JSON.stringify(validated);
    upsertFn(key, valueJson);
    updated.push(`${key}=${valueJson}`);
  }
  if (updated.length) log.info(`${logLabel}  updates: ${updated.join('  ')}`);
  return dropped;
}

/**
 * 把 LLM 返回的 patch（含超限压缩）写入世界 / 角色 / 玩家 / nearby 各类会话状态。
 * 各 write* 返回校验未通过的字段，供汇总本轮没写入的改动。
 */
function writeWorldState(patch, { sessionId, worldId, world, worldActiveFields, worldValueMap }) {
  if (worldActiveFields.length === 0) return [];
  const values = [];
  const dropped = applyStatePatch(worldActiveFields, patch.world,
    (fieldKey, runtimeValueJson) => values.push({ fieldKey, runtimeValueJson }),
    `world="${world.name}"`, worldValueMap
  );
  upsertSessionWorldStateValues(sessionId, worldId, values);
  return dropped.map((field) => ({ target: '世界', field }));
}

function writeCharacterStates(patch, { sessionId, charSchemaFields, charactersWithFields, charValueMaps }) {
  const characterValues = [];
  const dropped = [];
  for (let i = 0; i < charactersWithFields.length; i++) {
    const char = charactersWithFields[i];
    const charDropped = applyStatePatch(charSchemaFields, patch[`char_${i}`],
      (fieldKey, runtimeValueJson) => characterValues.push({ characterId: char.id, fieldKey, runtimeValueJson }),
      `char="${char.name}"`, charValueMaps[i]
    );
    dropped.push(...charDropped.map((field) => ({ target: char.name, field })));
  }
  upsertSessionCharacterStateValues(sessionId, characterValues);
  return dropped;
}

function writePersonaState(patch, { sessionId, worldId, world, personaActiveFields, personaValueMap }) {
  if (personaActiveFields.length === 0) return [];
  const values = [];
  const dropped = applyStatePatch(personaActiveFields, patch.persona,
    (fieldKey, runtimeValueJson) => values.push({ fieldKey, runtimeValueJson }),
    `persona  world="${world?.name}"`, personaValueMap
  );
  upsertSessionPersonaStateValues(sessionId, worldId, values);
  return dropped.map((field) => ({ target: '玩家', field }));
}

export async function writeStatePatch(patch, { sid, sessionId, worldId, world, targets, valueMaps, round, turnText, realDate, mainCharacterEntityId }) {
  const { worldActiveFields, charSchemaFields, charactersWithFields, personaActiveFields } = targets;
  const { worldValueMap, charValueMaps, personaValueMap } = valueMaps;

  // ── 字数/列表检查：超限时压缩后再写入 ──
  await compressOverLimitFields(patch, [
    ...(worldActiveFields.length > 0 ? [{ entityKey: 'world', fields: worldActiveFields, patchData: patch.world, valueMap: worldValueMap }] : []),
    ...charactersWithFields.map((_, i) => ({ entityKey: `char_${i}`, fields: charSchemaFields, patchData: patch[`char_${i}`], valueMap: charValueMaps[i] })),
    ...(personaActiveFields.length > 0 ? [{ entityKey: 'persona', fields: personaActiveFields, patchData: patch.persona, valueMap: personaValueMap }] : []),
  ], sid, sessionId);

  // 本轮各类状态与被拒改动的记录在同一事务里写入，中途出错整轮不落库
  withSessionStateTransaction(() => {
    // ── 写入各类状态（会话级） ──
    const fieldDrops = [
      ...writeWorldState(patch, { sessionId, worldId, world, worldActiveFields, worldValueMap }),
      ...writeCharacterStates(patch, { sessionId, charSchemaFields, charactersWithFields, charValueMaps }),
      ...writePersonaState(patch, { sessionId, worldId, world, personaActiveFields, personaValueMap }),
    ];

    // ── 状态记忆：实体档案/动态状态/关系/事项（memory）+ 在场名单（present）+ NPC 用户字段补丁（entity_fields） ──
    const memoryResult = applyStateMemoryOps({
      sessionId, worldId, round, ops: patch.memory, turnText, realDate, mainCharacterEntityId,
    });
    const presenceResult = applyPresence({
      sessionId, round, present: patch.present, createdCharacterIds: memoryResult.createdCharacterIds,
    });
    const entityFieldsResult = applyEntityFields({
      sessionId, worldId, entityFields: patch.entity_fields, mainCharacterEntityId,
    });
    upsertStateUpdateRejections(sessionId, round, describeStateUpdateRejections(sessionId, worldId, {
      fieldDrops,
      memoryRejected: memoryResult.rejected,
      entityFieldsRejected: entityFieldsResult.rejected,
      unresolvedPresence: presenceResult.unresolved,
    }));
    log.info(`STATE MEMORY  ${formatMeta({
      session: sid,
      memoryApplied: memoryResult.applied,
      memoryRejected: memoryResult.rejected.length,
      presentWritten: presenceResult.written,
      entityFieldsApplied: entityFieldsResult.applied,
      entityFieldsRejected: entityFieldsResult.rejected.length,
    })}`);
  });
}
