/**
 * trigger-evaluator.js — 触发器评估引擎
 *
 * 导出三个函数：
 *   evaluateCondition(condition, stateMap)   — 纯函数，评估单条件
 *   collectStateValues(worldId, sessionId)   — 收集当前会话所有状态值
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
  getActionByTriggerId,
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

// ─── collectStateValues ───────────────────────────────────────────

/**
 * 收集当前会话所有状态值，返回 Map<"实体名.字段标签", string>
 *
 * @param {string} worldId
 * @param {string} sessionId
 * @returns {Map<string, string>}
 */
export function collectStateValues(worldId, sessionId) {
  const map = new Map();

  // 世界状态：key = "世界.${label}"
  const worldRows = getSessionWorldStateValues(sessionId, worldId);
  for (const row of worldRows) {
    const val = parseEffectiveValue(row.effective_value_json);
    if (val != null) map.set(`世界.${row.label}`, val);
  }

  // 玩家状态：key = "玩家.${label}"
  const personaRows = getSessionPersonaStateValues(sessionId, worldId);
  for (const row of personaRows) {
    const val = parseEffectiveValue(row.effective_value_json);
    if (val != null) map.set(`玩家.${row.label}`, val);
  }

  // 角色状态：根据 session 类型获取角色列表
  const session = getSessionById(sessionId);
  if (!session) return map;

  let characters = [];

  if (session.mode === 'writing') {
    // writing 会话：从 writing_session_characters 获取（已含 name 字段）
    characters = getWritingSessionCharacters(sessionId);
  } else if (session.character_id) {
    // chat 会话：单角色，需要查角色名
    const char = getCharacterById(session.character_id);
    if (char) characters = [char];
  }

  // 逐角色查询状态值（用 getSingleCharacterSessionStateValues 避免 CROSS JOIN 不返回 character_id 的问题）
  for (const char of characters) {
    const rows = getSingleCharacterSessionStateValues(sessionId, char.id, worldId);
    for (const row of rows) {
      const val = parseEffectiveValue(row.effective_value_json);
      if (val != null) map.set(`${char.name}.${row.label}`, val);
    }
  }

  return map;
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

  const stateMap = collectStateValues(worldId, sessionId);
  log.debug(`trigger-eval session=${sessionId} triggers=${triggers.length} stateKeys=${stateMap.size}`);

  for (const trigger of triggers) {
    const conditions = listConditionsByTrigger(trigger.id);

    // 条件为空时不触发；所有条件 AND 逻辑
    if (conditions.length === 0) continue;
    const allMet = conditions.every((c) => evaluateCondition(c, stateMap));

    if (!allMet) continue;

    log.info(`触发器命中 id=${trigger.id} name=${trigger.name}`);

    // 获取动作并执行
    const action = getActionByTriggerId(trigger.id);

    if (action) {
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
            updateActionParams(trigger.id, { rounds_remaining: injectRounds });
            log.info(`触发器 inject_prompt 初始化 rounds=${injectRounds} trigger_id=${trigger.id}`);
          }
          break;
        }
        default:
          log.warn(`未知动作类型 action_type=${action.action_type}`);
      }
    }

    // 更新 last_triggered_round
    updateTrigger(trigger.id, { last_triggered_round: roundIndex });

    // one_shot：触发后禁用
    if (trigger.one_shot === 1) {
      updateTrigger(trigger.id, { enabled: 0 });
      log.info(`触发器 one_shot 已禁用 id=${trigger.id}`);
    }
  }

  return { notifications };
}
