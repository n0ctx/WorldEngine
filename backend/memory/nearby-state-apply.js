/**
 * nearby-state-apply.js — 写作模式下把 LLM 输出的 nearby_characters 应用到 DB
 *
 * 规则：
 *  1. ref_id 命中池 → 更新该 nearby（name/persona/state）
 *  2. ref_id 不命中 → 整条丢弃（log.warn）
 *  3. ref_id=null + name 命中池 → 等同 ref_id 命中
 *  4. ref_id=null + name 不在池 → 新建 transient（is_saved=0），写入 state
 *  5. 池里没回的 transient 删除（saved 永远保留）
 *  6. 未启用字段或类型校验失败 → 跳过
 */

import {
  createNearbyCharacter,
  deleteTransientNotInIds,
  touchNearbyRows,
  getNearbyByName,
  listNearbyBySessionId,
  updateNearbyPersona,
  updateNearbyName,
} from '../db/queries/session-nearby-characters.js';
import {
  getStateValuesByNearbyIds,
  upsertNearbyStateValues,
} from '../db/queries/session-nearby-character-state-values.js';
import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import { getPersonaById } from '../db/queries/personas.js';
import { buildNearbyPromptSection } from '../prompts/nearby-prompt.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import { validateValue } from '../utils/state-field-validate.js';

const log = createLogger('all-state');

/**
 * 写作模式：组装本轮 nearby pool 上下文（登场角色池 + 启用字段 + 玩家名）。
 */
export function buildNearbyContext(sessionId, charWorldId, personaId) {
  let nearbyPlayerName = '';
  if (personaId) {
    const persona = getPersonaById(personaId);
    nearbyPlayerName = typeof persona?.name === 'string' ? persona.name.trim() : '';
  }
  const nearbyEnabledFields = getCharacterStateFieldsByWorldId(charWorldId)
    .filter((f) => Number(f.nearby_enabled) === 1);
  const rows = listNearbyBySessionId(sessionId);
  const valuesByNearby = getStateValuesByNearbyIds(rows.map((row) => row.id));
  const nearbyPool = rows.map((row) => {
    const state = {};
    for (const value of valuesByNearby.get(row.id)) {
      if (value.runtime_value_json == null) continue;
      try { state[value.field_key] = JSON.parse(value.runtime_value_json); }
      catch { state[value.field_key] = value.runtime_value_json; }
    }
    return {
      id: row.id,
      name: row.name,
      is_saved: Number(row.is_saved) === 1 ? 1 : 0,
      persona: row.persona ?? '',
      state,
    };
  });
  return { nearbyPool, nearbyEnabledFields, nearbyPlayerName };
}

// TODO(token): nearby pool 每轮由 listNearbyBySessionId + getStateValuesByNearbyIds 重建，
//   且 buildNearbyPromptSection 把「指令」与「逐轮变化的池数据」揉在一起，无法切出稳定前缀。
//   后续可考虑：把 nearby 的「字段定义/输出格式说明」抽进 schema 前缀，仅把池数据留在动态段；
//   并对 pool 做会话级缓存 + 失效（saved/transient 变更时 invalidate）。当前保守只放进动态段，不缓存。
/**
 * 把 nearby pool 渲染为 prompt 段，追加到 valueSections / responseKeys（写作模式）。
 */
export function appendNearbyPromptSection(valueSections, responseKeys, nearbyContext) {
  valueSections.push(
    `=== 登场角色（nearby_characters）===\n` +
      buildNearbyPromptSection(nearbyContext.nearbyPool, nearbyContext.nearbyEnabledFields, { playerName: nearbyContext.nearbyPlayerName })
  );
  responseKeys.push('"nearby_characters"（本轮登场角色，数组）');
}

function applyNearbyState(targetId, stateObj, { sessionId, enabledKeys, fieldByKey }) {
  if (!stateObj || typeof stateObj !== 'object' || Array.isArray(stateObj)) return;
  const values = [];
  for (const [key, raw] of Object.entries(stateObj)) {
    if (!enabledKeys.has(key)) continue;
    const validated = validateValue(raw, fieldByKey[key]);
    if (validated === undefined) continue;
    const valueJson = validated === null ? null : JSON.stringify(validated);
    values.push({ sessionId, nearbyId: targetId, fieldKey: key, valueJson });
  }
  upsertNearbyStateValues(values);
}

function applyNearbyPatch(targetId, item, context) {
  const { sessionId, poolById, poolByName, seenIds } = context;
  const poolItem = poolById[targetId];
  if (typeof item.persona === 'string') updateNearbyPersona(targetId, item.persona);

  // 改名：仅当 LLM 给了非空 name 且与现有不同 且 池内无同名占用
  if (typeof item.name === 'string' && item.name.trim() && poolItem && item.name !== poolItem.name) {
    const conflict = poolByName[item.name];
    if (!conflict) {
      updateNearbyName(targetId, item.name);
    } else if (conflict.id !== targetId) {
      log.warn(`NEARBY RENAME SKIP  ${formatMeta({ session: sessionId.slice(0, 8), id: targetId, want: item.name, conflictId: conflict.id })}`);
    }
  }
  applyNearbyState(targetId, item.state, context);
  seenIds.add(targetId);
}

function createTransientNearby(name, item, context) {
  const { sessionId, fields, seenIds } = context;
  const persona = typeof item.persona === 'string' ? item.persona : '';
  let newId;
  try {
    newId = createNearbyCharacter({ sessionId, name, persona, isSaved: 0 });
  } catch (err) {
    // UNIQUE 冲突等场景兜底
    log.warn(`NEARBY CREATE FAIL  ${formatMeta({ session: sessionId.slice(0, 8), name, error: err.message })}`);
    const existed = getNearbyByName(sessionId, name);
    if (!existed) return;
    newId = existed.id;
  }
  applyNearbyState(newId, item.state, context);
  // 诊断：新登场角色按 prompt 约束应填齐所有启用字段，缺字段时 warn
  const stateKeys = item.state && typeof item.state === 'object' ? Object.keys(item.state) : [];
  const missing = fields.map((field) => field.field_key).filter((key) => !stateKeys.includes(key));
  if (missing.length) {
    log.warn(`NEARBY NEW MISSING FIELDS  ${formatMeta({ session: sessionId.slice(0, 8), name, missing: missing.join(',') })}`);
  }
  seenIds.add(newId);
}

/**
 * 把 LLM 输出的 nearby_characters 应用到 DB（写作模式）。
 *
 * @param {object}   params
 * @param {string}   params.sessionId
 * @param {string}   params.worldId
 * @param {object[]} params.fields              启用的 character_state_fields
 * @param {*}        params.nearby_characters   LLM 输出（可能不是数组）
 * @param {Array<{id:string,name:string,is_saved:0|1}>} params.pool
 */
export function applyNearbyResult({ sessionId, worldId: _worldId, fields, nearby_characters, pool, playerName = '' }) {
  const items = Array.isArray(nearby_characters) ? nearby_characters : [];
  const enabledKeys = new Set(fields.map((f) => f.field_key));
  const fieldByKey = Object.fromEntries(fields.map((f) => [f.field_key, f]));
  const poolById = Object.fromEntries(pool.map((p) => [p.id, p]));
  const poolByName = Object.fromEntries(pool.map((p) => [p.name, p]));
  const seenIds = new Set();
  const playerNameTrim = typeof playerName === 'string' ? playerName.trim() : '';
  const context = { sessionId, fields, enabledKeys, fieldByKey, poolById, poolByName, seenIds };

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const itemName = typeof item.name === 'string' ? item.name.trim() : '';
    if (playerNameTrim && itemName && itemName === playerNameTrim) {
      log.warn(`NEARBY DROP PLAYER  ${formatMeta({ session: sessionId.slice(0, 8), name: itemName })}`);
      continue;
    }
    const refId = item.ref_id ?? null;
    if (refId) {
      if (poolById[refId]) {
        applyNearbyPatch(refId, item, context);
      } else {
        log.warn(`NEARBY REF MISS  ${formatMeta({ session: sessionId.slice(0, 8), ref_id: refId })}`);
      }
      continue;
    }
    // ref_id == null
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) continue;
    if (poolByName[name]) {
      applyNearbyPatch(poolByName[name].id, item, context);
      continue;
    }
    createTransientNearby(name, item, context);
  }

  // 清理：保留 saved 全部 + 本轮提到的 transient
  const keepIds = pool.filter((p) => p.is_saved === 1 || seenIds.has(p.id)).map((p) => p.id);
  // 本轮新建的 transient 不在 pool 里，但 deleteTransientNotInIds 仅删 transient，
  // 新建的 ID 也需要保留：合并到 keepIds
  for (const id of seenIds) {
    if (!keepIds.includes(id)) keepIds.push(id);
  }
  deleteTransientNotInIds(sessionId, keepIds);

  // 本轮"被 LLM 触达"信号：bump updated_at，供前端判断 saved 角色是否登场（自动展开/收起）
  // state_updated_at 在 state 字段空时不前进，所以单独维护 row.updated_at
  touchNearbyRows(seenIds);
}
