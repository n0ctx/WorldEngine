/**
 * Prompt 条目触发匹配
 *
 * 对外暴露：
 *   matchEntries(sessionId, entries) → Promise<Set<string>>
 *
 * 触发逻辑（按 trigger_type 分流）：
 *   always（或无 trigger_type）：直接触发，不走任何匹配逻辑
 *   keyword：只走关键词匹配
 *   llm：LLM preflight（有 description 时）+ 关键词兜底
 *
 *   LLM 失败时降级为纯关键词匹配（仅影响 llm 类型）
 */

import { getMessagesBySessionId } from '../db/queries/messages.js';
import { getSessionById } from '../db/queries/sessions.js';
import {
  getSessionWorldStateValues,
  getSessionPersonaStateValues,
  getSingleCharacterSessionStateValues,
} from '../db/queries/session-state-values.js';
import { getWritingSessionCharacters } from '../db/queries/writing-sessions.js';
import { listConditionsByEntry } from '../db/queries/entry-conditions.js';
import * as llm from '../llm/index.js';
import {
  PROMPT_ENTRY_SCAN_WINDOW,
  PROMPT_ENTRY_LLM_MAX_TOKENS,
  ALL_MESSAGES_LIMIT,
} from '../utils/constants.js';
import { createLogger } from '../utils/logger.js';
import { renderBackendPrompt, loadBackendPrompt } from './prompt-loader.js';
import { resolveAuxScope } from '../utils/aux-scope.js';

const log = createLogger('entry', 'magenta');

/**
 * LLM pre-flight 判断：返回触发条目的 id 集合。
 * 失败时静默返回空集合（关键词兜底负责其余条目）。
 *
 * @param {Array}  entriesWithDesc  description 非空的条目列表
 * @param {string} contextLines     近一轮对话文本
 * @returns {Promise<Set<string>>}
 */
async function tryLlmMatch(entriesWithDesc, contextLines, sessionId) {
  const triggered = new Set();
  try {
    const descList = entriesWithDesc
      .map((e, i) => `${i + 1}. 【${e.title}】${e.description}`)
      .join('\n');

    // 使用单条 user 消息（system 指令并入 user），避免发送独立 role:'system' 消息。
    // 当 aux_llm 未配置而回落到主模型时，独立 system 消息会与主对话 stream 的不同 system
    // 前缀竞争 provider 的 prefix cache 槽，导致 stream 调用 cache 命中率下降。
    const messages = [
      {
        role: 'user',
        content: loadBackendPrompt('entry-preflight-system.md') + '\n\n' + renderBackendPrompt('entry-preflight-user.md', {
          CONTEXT_LINES: contextLines,
          DESC_LIST: descList,
        }),
      },
    ];

    const raw = await llm.complete(messages, { temperature: 0, maxTokens: PROMPT_ENTRY_LLM_MAX_TOKENS, thinking_level: null, configScope: resolveAuxScope(sessionId), callType: 'entry_match', conversationId: sessionId });

    const stripped = (raw || '')
      .replace(/<think>[\s\S]*?<\/think>\n*/g, '')
      .replace(/<think>[\s\S]*$/, '')
      .trim();
    const cleaned = stripped.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const indices = JSON.parse(cleaned);

    if (Array.isArray(indices)) {
      for (const idx of indices) {
        const entry = entriesWithDesc[idx - 1];
        if (entry) triggered.add(entry.id);
      }
    }
  } catch (err) {
    log.warn(`LLM preflight 失败，降级为关键词匹配: ${err.message}`);
  }
  return triggered;
}

/**
 * 将 keyword_scope 字符串解析为作用域集合。
 * 空值 / 'both' → {'user','assistant'}；其余按逗号拆分并过滤合法值。
 *
 * @param {string} rawScope
 * @returns {Set<string>}
 */
function resolveKeywordScopes(rawScope) {
  const s = typeof rawScope === 'string' ? rawScope.trim().toLowerCase() : '';
  if (s === 'both' || s === '') return new Set(['user', 'assistant']);
  return new Set(
    s.split(',').map((p) => p.trim()).filter((p) => p === 'user' || p === 'assistant'),
  );
}

/**
 * 判断单个条目是否被关键词匹配命中。
 *
 * @param {object} entry
 * @param {string} userScanText   小写化后的用户侧扫描文本
 * @param {string} asstScanText   小写化后的 AI 侧扫描文本
 * @returns {boolean}
 */
function matchByKeywords(entry, userScanText, asstScanText) {
  if (!entry.keywords || entry.keywords.length === 0) return false;
  const scopes = resolveKeywordScopes(entry.keyword_scope);
  const hitUser = scopes.has('user') && entry.keywords.some((kw) => userScanText.includes(kw.toLowerCase()));
  const hitAsst = scopes.has('assistant') && entry.keywords.some((kw) => asstScanText.includes(kw.toLowerCase()));
  return hitUser || hitAsst;
}

export const __testables = {
  tryLlmMatch,
  resolveKeywordScopes,
  matchByKeywords,
};

// ─── 状态条件评估 ────────────────────────────────────────────

const NUMERIC_OPS = new Set(['>', '<', '=', '>=', '<=', '!=']);
const TEXT_OPS = new Set(['包含', '等于', '不包含']);
const ISO_DATETIME_RE = /^(\d+)-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DATETIME_PART_RE = /^(year|month|day|hour|minute):(\d+)$/;

const DATETIME_PART_INDEX = { year: 1, month: 2, day: 3, hour: 4, minute: 5 };

/**
 * 从 ISO datetime 字符串中提取指定部分（year/month/day/hour/minute）的整数值。
 * 返回 null 表示解析失败。
 */
function extractDatetimePart(isoStr, part) {
  const m = isoStr.match(ISO_DATETIME_RE);
  if (!m) return null;
  const idx = DATETIME_PART_INDEX[part];
  if (!idx) return null;
  return parseInt(m[idx], 10);
}

/**
 * 数值比较 datetime 字符串：解析年份为整数（允许任意正整数位数），
 * 月/日/时/分固定 2 位。返回 -1 / 0 / 1。
 */
function compareDatetime(a, b) {
  const ma = a.match(ISO_DATETIME_RE);
  const mb = b.match(ISO_DATETIME_RE);
  if (!ma || !mb) return null;
  for (let i = 1; i <= 5; i++) {
    const av = parseInt(ma[i], 10);
    const bv = parseInt(mb[i], 10);
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

function applyNumericOp(cur, thr, operator) {
  switch (operator) {
    case '>':  return cur > thr;
    case '<':  return cur < thr;
    case '=':  return cur === thr;
    case '>=': return cur >= thr;
    case '<=': return cur <= thr;
    case '!=': return cur !== thr;
    default:   return false;
  }
}

function evaluateCondition(condition, stateMap) {
  const { target_field, operator, value } = condition;
  if (!stateMap.has(target_field)) return false;
  const current = stateMap.get(target_field);
  if (NUMERIC_OPS.has(operator)) {
    const cur = Number(current);
    const thr = Number(value);
    if (Number.isFinite(cur) && Number.isFinite(thr)) {
      return applyNumericOp(cur, thr, operator);
    }
    // datetime 部分比较："year:2024" / "month:3" 等格式
    const partMatch = value.match(DATETIME_PART_RE);
    if (partMatch) {
      const partVal = extractDatetimePart(current, partMatch[1]);
      if (partVal != null) {
        return applyNumericOp(partVal, parseInt(partMatch[2], 10), operator);
      }
      return false;
    }
    // 兼容旧格式：全量 ISO datetime 字符串对比
    const cmp = compareDatetime(current, value);
    if (cmp != null) {
      switch (operator) {
        case '>':  return cmp > 0;
        case '<':  return cmp < 0;
        case '=':  return cmp === 0;
        case '>=': return cmp >= 0;
        case '<=': return cmp <= 0;
        case '!=': return cmp !== 0;
      }
    }
    return false;
  }
  if (TEXT_OPS.has(operator)) {
    switch (operator) {
      case '包含':   return current.includes(value);
      case '等于':   return current === value;
      case '不包含': return !current.includes(value);
    }
  }
  return false;
}

function parseStateValue(effectiveValueJson) {
  if (effectiveValueJson == null) return null;
  try {
    const parsed = JSON.parse(effectiveValueJson);
    if (parsed == null) return null;
    return String(parsed);
  } catch {
    return String(effectiveValueJson);
  }
}

/**
 * 将 row 写入 stateMap：
 *   - 普通字段：`scope.label` → 字符串值
 *   - type='table' 字段：除写入整体值外，再按列展开为 `scope.label.column_key` → 数值字符串
 */
function setStateMapRow(map, scope, row) {
  if (row.type === 'table' && row.effective_value_json != null) {
    let obj;
    try { obj = JSON.parse(row.effective_value_json); } catch { obj = null; }
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const [colKey, colVal] of Object.entries(obj)) {
        if (colVal == null) continue;
        map.set(`${scope}.${row.label}.${colKey}`, String(colVal));
      }
    }
    return;
  }
  const val = parseStateValue(row.effective_value_json);
  if (val != null) map.set(`${scope}.${row.label}`, val);
}

function buildSharedStateMap(worldId, sessionId) {
  const map = new Map();
  for (const row of getSessionWorldStateValues(sessionId, worldId)) {
    setStateMapRow(map, '世界', row);
  }
  for (const row of getSessionPersonaStateValues(sessionId, worldId)) {
    setStateMapRow(map, '玩家', row);
  }
  return map;
}

function buildCharacterStateMap(worldId, sessionId, characterId) {
  const map = new Map();
  if (!characterId) return map;
  for (const row of getSingleCharacterSessionStateValues(sessionId, characterId, worldId)) {
    setStateMapRow(map, '角色', row);
  }
  return map;
}

function mergeStateMaps(...maps) {
  const merged = new Map();
  for (const map of maps) for (const [k, v] of map) merged.set(k, v);
  return merged;
}

/**
 * 判断哪些 Prompt 条目需要注入正文（触发）
 *
 * @param {string} sessionId
 * @param {Array}  entries  所有条目的合并列表（global + world + character，已按注入顺序排列）
 * @returns {Promise<Set<string>>}  触发条目的 id 集合
 */
export async function matchEntries(sessionId, entries, worldId = null) {
  if (!entries || entries.length === 0) return new Set();

  const allMessages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);

  const lastUser = [...allMessages].reverse().find((m) => m.role === 'user');
  const lastAsst = [...allMessages].reverse().find((m) => m.role === 'assistant');
  const contextLines = [
    lastAsst ? `AI：${lastAsst.content}` : '',
    lastUser ? `用户：${lastUser.content}` : '',
  ].filter(Boolean).join('\n');

  const recentMessages = allMessages.slice(-PROMPT_ENTRY_SCAN_WINDOW);
  const userScanText = recentMessages.filter((m) => m.role === 'user').map((m) => m.content).join('\n').toLowerCase();
  const asstScanText = recentMessages.filter((m) => m.role === 'assistant').map((m) => m.content).join('\n').toLowerCase();

  const triggered = new Set();

  // 按 trigger_type 分流：无 trigger_type 视为 'always'
  const alwaysEntries = [];
  const keywordEntries = [];
  const llmEntries = [];
  const stateEntries = [];

  for (const entry of entries) {
    const type = entry.trigger_type || 'always';
    if (type === 'always') {
      alwaysEntries.push(entry);
    } else if (type === 'keyword') {
      keywordEntries.push(entry);
    } else if (type === 'llm') {
      llmEntries.push(entry);
    } else if (type === 'state') {
      stateEntries.push(entry);
    } else {
      // 未知类型降级为 always
      alwaysEntries.push(entry);
    }
  }

  // always：直接触发，不走匹配
  for (const entry of alwaysEntries) {
    triggered.add(entry.id);
  }

  // keyword：只走关键词匹配
  for (const entry of keywordEntries) {
    if (matchByKeywords(entry, userScanText, asstScanText)) {
      triggered.add(entry.id);
    }
  }

  // llm：LLM pre-flight（仅处理有 description 的条目）+ 关键词兜底
  if (llmEntries.length > 0) {
    const llmEntriesWithDesc = llmEntries.filter((e) => e.description && e.description.trim());
    const llmTriggered = llmEntriesWithDesc.length > 0 && contextLines
      ? await tryLlmMatch(llmEntriesWithDesc, contextLines, sessionId)
      : new Set();

    for (const id of llmTriggered) {
      triggered.add(id);
    }

    // 关键词兜底：对未触发的 llm 类型条目补充匹配
    for (const entry of llmEntries) {
      if (!triggered.has(entry.id) && matchByKeywords(entry, userScanText, asstScanText)) {
        triggered.add(entry.id);
      }
    }
  }

  // state：实时评估状态条件（AND = 全部满足，OR = 任一满足）
  if (stateEntries.length > 0 && worldId) {
    const session = getSessionById(sessionId);
    const sharedMap = buildSharedStateMap(worldId, sessionId);

    if (session?.mode === 'writing') {
      // writing 模式：对每个激活角色评估；任一角色满足条件组合即触发
      const writingChars = getWritingSessionCharacters(sessionId);
      for (const entry of stateEntries) {
        const conditions = listConditionsByEntry(entry.id);
        if (conditions.length === 0) continue;
        const check = entry.condition_logic === 'OR' ? 'some' : 'every';
        const hasCharCond = conditions.some((c) => c.target_field.startsWith('角色.'));
        let allMet = false;
        if (hasCharCond && writingChars.length > 0) {
          allMet = writingChars.some((char) => {
            const charMap = buildCharacterStateMap(worldId, sessionId, char.id);
            return conditions[check]((c) => evaluateCondition(c, mergeStateMaps(sharedMap, charMap)));
          });
        } else {
          allMet = conditions[check]((c) => evaluateCondition(c, sharedMap));
        }
        if (allMet) triggered.add(entry.id);
      }
    } else {
      // chat 模式：使用 world + persona + 当前角色状态
      const charMap = session?.character_id
        ? buildCharacterStateMap(worldId, sessionId, session.character_id)
        : new Map();
      const stateMap = mergeStateMaps(sharedMap, charMap);
      for (const entry of stateEntries) {
        const conditions = listConditionsByEntry(entry.id);
        if (conditions.length === 0) continue;
        const check = entry.condition_logic === 'OR' ? 'some' : 'every';
        if (conditions[check]((c) => evaluateCondition(c, stateMap))) {
          triggered.add(entry.id);
        }
      }
    }
  }

  return triggered;
}
