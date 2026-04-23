/**
 * trigger-evaluator.js — 触发器评估引擎
 *
 * 导出三个函数：
 *   evaluateCondition(condition, stateMap)   — 纯函数，评估单条件
 *   collectStateValues(worldId, sessionId)   — 收集当前会话有效状态值
 *   evaluateTriggers(worldId, sessionId, roundIndex) — 评估并执行触发器动作
 */

import { createLogger } from '../utils/logger.js';
import { getSessionById } from '../db/queries/sessions.js';
import { getCharacterById } from '../db/queries/characters.js';
import {
  getSessionWorldStateValues,
  getSessionPersonaStateValues,
  getSingleCharacterSessionStateValues,
} from '../db/queries/session-state-values.js';
import { getWritingSessionCharacters } from '../db/queries/writing-sessions.js';
import {
  listTriggersByWorld,
  listConditionsByTrigger,
  getActionsByTriggerId,
  updateTrigger,
  updateActionParams,
} from '../db/queries/triggers.js';
import { updateWorldEntry } from '../db/queries/prompt-entries.js';

const log = createLogger('trigger-eval');

// ─── 操作符集合 ────────────────────────────────────────────────────

const NUMERIC_OPS = new Set(['>', '<', '=', '>=', '<=', '!=']);
const TEXT_OPS = new Set(['包含', '等于', '不包含']);

// ─── evaluateCondition ────────────────────────────────────────────

/**
 * 评估单个触发器条件（纯函数）
 *
 * @param {{ target_field: string, operator: string, value: string }} condition
 * @param {Map<string, string>} stateMap  key = "实体名.字段标签", value = 字符串值
 * @returns {boolean}
 */
export function evaluateCondition(condition, stateMap) {
  const { target_field, operator, value } = condition;

  if (!stateMap.has(target_field)) return false;

  const current = stateMap.get(target_field);

  if (NUMERIC_OPS.has(operator)) {
    const cur = Number(current);
    const thr = Number(value);
    if (!Number.isFinite(cur) || !Number.isFinite(thr)) return false;
    switch (operator) {
      case '>':  return cur > thr;
      case '<':  return cur < thr;
      case '=':  return cur === thr;
      case '>=': return cur >= thr;
      case '<=': return cur <= thr;
      case '!=': return cur !== thr;
    }
  }

  if (TEXT_OPS.has(operator)) {
    switch (operator) {
      case '包含':   return current.includes(value);
      case '等于':   return current === value;
      case '不包含': return !current.includes(value);
    }
  }

  log.warn(`未知操作符: ${operator}`);
  return false;
}

// ─── 内部辅助：解析 effective_value_json 为字符串 ─────────────────

function parseEffectiveValue(effectiveValueJson) {
  if (effectiveValueJson == null) return null;
  try {
    const parsed = JSON.parse(effectiveValueJson);
    if (parsed == null) return null;
    return String(parsed);
  } catch {
    return String(effectiveValueJson);
  }
}

function collectSharedStateValues(worldId, sessionId) {
  const map = new Map();

  for (const row of getSessionWorldStateValues(sessionId, worldId)) {
    const val = parseEffectiveValue(row.effective_value_json);
    if (val != null) map.set(`世界.${row.label}`, val);
  }

  for (const row of getSessionPersonaStateValues(sessionId, worldId)) {
    const val = parseEffectiveValue(row.effective_value_json);
    if (val != null) map.set(`玩家.${row.label}`, val);
  }

  return map;
}

function collectCharacterStateValues(worldId, sessionId, characterId) {
  const map = new Map();
  if (!characterId) return map;

  for (const row of getSingleCharacterSessionStateValues(sessionId, characterId, worldId)) {
    const val = parseEffectiveValue(row.effective_value_json);
    if (val != null) map.set(`角色.${row.label}`, val);
  }

  return map;
}

function getSessionCharacters(session) {
  if (!session) return [];
  if (session.mode === 'writing') return getWritingSessionCharacters(session.id);
  if (!session.character_id) return [];

  const char = getCharacterById(session.character_id);
  return char ? [char] : [];
}

function mergeStateMaps(...maps) {
  const merged = new Map();
  for (const map of maps) {
    for (const [key, value] of map.entries()) {
      merged.set(key, value);
    }
  }
  return merged;
}

// ─── collectStateValues ───────────────────────────────────────────

/**
 * 收集当前会话有效状态值，返回 Map<"实体名.字段标签", string>
 * - world/persona 始终收集
 * - chat 会话默认合并当前角色为 "角色.xxx"
 * - writing 会话如需角色态，调用方应显式传入 characterId
 *
 * @param {string} worldId
 * @param {string} sessionId
 * @param {string|null} [characterId]
 * @returns {Map<string, string>}
 */
export function collectStateValues(worldId, sessionId, characterId = null) {
  const sharedMap = collectSharedStateValues(worldId, sessionId);
  const session = getSessionById(sessionId);
  if (!session) return sharedMap;

  const resolvedCharacterId = characterId ?? (session.mode === 'chat' ? session.character_id : null);
  if (!resolvedCharacterId) return sharedMap;

  return mergeStateMaps(sharedMap, collectCharacterStateValues(worldId, sessionId, resolvedCharacterId));
}

// ─── evaluateTriggers ─────────────────────────────────────────────

/**
 * 评估并执行触发器动作
 *
 * @param {string} worldId
 * @param {string} sessionId
 * @param {number} roundIndex
 * @returns {{ notifications: Array<{name: string, text: string}> }}
 */
export function evaluateTriggers(worldId, sessionId, roundIndex) {
  const notifications = [];

  const triggers = listTriggersByWorld(worldId).filter((t) => t.enabled === 1);
  if (triggers.length === 0) return { notifications };

  const session = getSessionById(sessionId);
  const sharedStateMap = collectSharedStateValues(worldId, sessionId);
  const defaultStateMap = collectStateValues(worldId, sessionId);
  const characterContexts = session?.mode === 'writing'
    ? getSessionCharacters(session).map((char) => ({
      id: char.id,
      name: char.name,
      stateMap: collectCharacterStateValues(worldId, sessionId, char.id),
    }))
    : [];
  log.debug(`trigger-eval session=${sessionId} triggers=${triggers.length} stateKeys=${defaultStateMap.size}`);

  for (const trigger of triggers) {
    const conditions = listConditionsByTrigger(trigger.id);

    // 条件为空时不触发；所有条件 AND 逻辑
    if (conditions.length === 0) continue;
    const hasCharacterCondition = conditions.some((c) => c.target_field.startsWith('角色.'));
    const allMet = session?.mode === 'writing' && hasCharacterCondition
      ? characterContexts.some((char) => evaluateConditionGroup(conditions, mergeStateMaps(sharedStateMap, char.stateMap)))
      : evaluateConditionGroup(conditions, defaultStateMap);

    if (!allMet) continue;

    log.info(`触发器命中 id=${trigger.id} name=${trigger.name}`);

    // 获取所有动作并逐一执行
    const actions = getActionsByTriggerId(trigger.id);

    for (const action of actions) {
      switch (action.action_type) {
        case 'notify': {
          const text = action.params?.text ?? '';
          notifications.push({ name: trigger.name, text });
          break;
        }
        case 'activate_entry': {
          const entryId = action.params?.entry_id;
          if (entryId) {
            updateWorldEntry(entryId, { trigger_type: 'always' });
            log.info(`触发器激活条目 entry_id=${entryId}`);
          }
          break;
        }
        case 'inject_prompt': {
          // consumed 模式：用 inject_rounds 初始化 rounds_remaining
          const injectRounds = action.params?.inject_rounds;
          if (action.params?.mode !== 'persistent' && injectRounds != null) {
            updateActionParams(action.id, { rounds_remaining: injectRounds });
            log.info(`触发器 inject_prompt 初始化 rounds=${injectRounds} action_id=${action.id}`);
          }
          break;
        }
        default:
          log.warn(`未知动作类型 action_type=${action.action_type}`);
      }
    }

    // 更新最后触发轮次；one_shot 命中后自动禁用
    updateTrigger(trigger.id, {
      last_triggered_round: roundIndex,
      ...(trigger.one_shot === 1 ? { enabled: 0 } : {}),
    });
  }

  return { notifications };
}

function evaluateConditionGroup(conditions, stateMap) {
  return conditions.every((condition) => evaluateCondition(condition, stateMap));
}
