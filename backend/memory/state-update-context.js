/**
 * state-update-context.js — 状态更新所需的字段定义/当前取值读取，及 prompt 各节组装
 *
 * 确定本轮活跃字段、读取世界/角色/玩家的默认值与会话运行时值，
 * 并渲染为 prompt 的 schema / values 文本段；另负责状态记忆接入所需的准备步骤
 * （基线捕获、本轮轮号、基础实体、真实日期时间、相关实体与 runtime 段组装）。
 */

import { getCharactersByIds } from '../db/queries/characters.js';

import { getWorldStateFieldsByWorldId } from '../db/queries/world-state-fields.js';
import { getAllWorldStateValues } from '../db/queries/world-state-values.js';
import { getSessionWorldStateValues } from '../db/queries/session-world-state-values.js';

import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import { getCharacterStateValuesByCharacterIds } from '../db/queries/character-state-values.js';
import { getSessionCharacterStateValuesByCharacterIds } from '../db/queries/session-character-state-values.js';

import { getPersonaStateFieldsByWorldId } from '../db/queries/persona-state-fields.js';
import { getAllPersonaStateValues, getAllPersonaStateValuesByPersonaId } from '../db/queries/persona-state-values.js';
import { getSessionPersonaStateValues } from '../db/queries/session-persona-state-values.js';
import { getPersonaById, getPersonaByWorldId } from '../db/queries/personas.js';
import { setSessionStateBaselineIfAbsent } from '../db/queries/sessions.js';
import { upsertWorldProfile } from '../db/queries/state-memory.js';

import { ENTITY_TYPES, getProfileFieldDefinitions, resolveActiveProfileFields } from './state-memory-schema.js';
import { ensureBaseEntities } from './state-memory-apply.js';
import { selectRelevantEntities, renderEntityDirectory, renderWorldFactsForUpdate, renderEntityDetailsForUpdate } from './state-memory-render.js';
import { captureFullSnapshot } from './state-rollback.js';
import { splitRounds } from '../utils/session-rounds.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const log = createLogger('all-state');

/**
 * 筛选本轮需要更新的活跃字段：状态字段触发机制已收敛为一维 update_mode。
 * update_mode='llm_auto' 的字段每轮参与自动状态更新。
 */
export function filterActive(fields) {
  return fields.filter((f) => f.update_mode === 'llm_auto');
}

/**
 * 将 getAllXxxStateValues() 返回的行转换为 valueMap。
 * @param {object[]} values  含 field_key / default_value_json / runtime_value_json 的行
 * @returns {Record<string, {defaultValueJson, runtimeValueJson}>}
 */
function buildValueMap(values) {
  return Object.fromEntries(
    values.map((v) => [v.field_key, {
      defaultValueJson: v.default_value_json,
      runtimeValueJson: v.runtime_value_json,
    }])
  );
}

/**
 * 将活跃字段列表渲染为「字段定义」文本段（schema 部分，逐字节稳定，不含任何运行时取值）。
 * 仅依赖字段定义本身（key/label/type/range/enum/description/update_instruction），
 * 因此同一会话各轮调用输出完全一致，可作为 prompt cache 稳定前缀。
 * @param {object[]} fields    活跃字段列表
 */
function buildFieldsSchema(fields) {
  return fields
    .map((f) => {
      let line = `- ${f.field_key}（${f.label}，类型：${f.type}）`;
      if (f.description) line += `，说明：${f.description}`;
      if (f.type === 'enum' && f.enum_options?.length)
        line += `，可选值：[${f.enum_options.join(' / ')}]`;
      if (f.type === 'number') {
        const lo = f.min_value != null ? f.min_value : '不限';
        const hi = f.max_value != null ? f.max_value : '不限';
        line += `，范围：${lo} ~ ${hi}`;
        if (f.unit) line += `，单位：${f.unit}（仅展示用途，写入值仍为纯数字）`;
      }
      if (f.type === 'list') line += `，请返回字符串数组（如 ["条目1","条目2"]），替换整个列表`;
      if (f.type === 'datetime') line += `，请返回 ISO 局部时间字符串 "YYYY-MM-DDTHH:mm"（年份为正整数、可任意位数；月/日/时/分各 2 位，例 "1000-03-15T14:30" 或 "238-04-20T00:00"），不得使用其他格式`;
      if (f.type === 'table' && Array.isArray(f.table_columns) && f.table_columns.length) {
        const colDesc = f.table_columns.map((c) => {
          const lo = c.min != null ? c.min : '不限';
          const hi = c.max != null ? c.max : '不限';
          return `${c.key}（${c.label ?? c.key}，${lo}~${hi}）`;
        }).join(' / ');
        line += `，请返回对象 {列key: 数值,...}，列：[${colDesc}]，仅数值类型`;
      }
      if (f.update_instruction) line += `\n  更新说明：${f.update_instruction}`;
      return line;
    })
    .join('\n');
}

/**
 * 将活跃字段列表渲染为「当前取值」文本段（动态部分，逐轮变化）。
 * 只输出每个字段的默认值 / 当前运行时值，放在 messages 末尾，不进入 cache 前缀。
 * @param {object[]} fields    活跃字段列表
 * @param {object}   valueMap  buildValueMap 返回的映射
 */
function buildFieldsValues(fields, valueMap) {
  return fields
    .map((f) => {
      const cur = valueMap[f.field_key] ?? { defaultValueJson: f.default_value ?? null, runtimeValueJson: null };
      // 只暴露「有效当前值」= 运行时值优先，回退默认值。不再单独展示默认值，
      // 避免弱副模型把默认值当成「回退靶子」，每轮把已推进的运行值打回默认。
      const effectiveJson = cur.runtimeValueJson ?? cur.defaultValueJson;
      return `- ${f.field_key}：当前值：${formatValueForPrompt(effectiveJson, f)}`;
    })
    .join('\n');
}

/**
 * 合并全局默认值 Map 与会话级运行时值：defaultValueJson 来自全局，runtimeValueJson 优先取会话值。
 * @param {ReturnType<typeof buildValueMap>} globalMap  buildValueMap 返回的全局 Map
 * @param {Record<string, string|null>}      sessionMap getSessionXxxStateValues 返回的 { field_key → runtime_value_json }
 */
function mergeSessionValues(globalMap, sessionMap) {
  return Object.fromEntries(
    Object.entries(globalMap).map(([key, v]) => [
      key,
      { defaultValueJson: v.defaultValueJson, runtimeValueJson: sessionMap[key] ?? v.runtimeValueJson },
    ])
  );
}

export function loadStateUpdateTargets(worldId, characterIds, world) {
  const worldActiveFields = world ? filterActive(getWorldStateFieldsByWorldId(worldId)) : [];
  const characters = getCharactersByIds(characterIds || []);
  // 角色状态字段 schema 由 world_id 决定，取第一个有效角色的 world_id。
  const charWorldId = characters[0]?.world_id ?? worldId;
  const charSchemaFields = charWorldId ? filterActive(getCharacterStateFieldsByWorldId(charWorldId)) : [];
  const charactersWithFields = charSchemaFields.length > 0 ? characters : [];
  const personaActiveFields = world ? filterActive(getPersonaStateFieldsByWorldId(worldId)) : [];

  return { worldActiveFields, characters, charWorldId, charSchemaFields, charactersWithFields, personaActiveFields };
}

export function buildEntityStateSections(targets, { world, worldId, sessionId, session }) {
  const {
    worldActiveFields, charactersWithFields, charSchemaFields, personaActiveFields,
  } = targets;
  const schemaSections = [];
  const valueSections = [];
  const responseKeys = [];
  let worldValueMap = null;
  const charValueMaps = [];
  let personaValueMap = null;

  if (worldActiveFields.length > 0) {
    worldValueMap = mergeSessionValues(
      buildValueMap(getAllWorldStateValues(worldId)),
      getSessionWorldStateValues(sessionId, worldId)
    );
    const head = `=== 世界状态（"${world.name}"）===`;
    schemaSections.push(`${head}\n` + buildFieldsSchema(worldActiveFields));
    valueSections.push(`${head}\n` + buildFieldsValues(worldActiveFields, worldValueMap));
    responseKeys.push('"world"（世界状态）');
  }

  const charIds = charactersWithFields.map((char) => char.id);
  const charDefaults = getCharacterStateValuesByCharacterIds(charIds);
  const charSessionValues = getSessionCharacterStateValuesByCharacterIds(sessionId, charIds);
  for (let i = 0; i < charactersWithFields.length; i++) {
    const char = charactersWithFields[i];
    const charKey = `char_${i}`;
    const charValueMap = mergeSessionValues(
      buildValueMap(charDefaults[char.id]),
      charSessionValues[char.id]
    );
    charValueMaps[i] = charValueMap;
    const head = `=== 角色状态（key="${charKey}"，角色名"${char.name}"）===`;
    schemaSections.push(
      `${head}\n` +
        `注意：只追踪"${char.name}"自身的状态变化。与"${char.name}"直接相关、并真实发生在其身上的共同经历（如受伤、获得报酬、装备损耗、位置变化）也应计入角色状态；仅玩家独有的变化不要记到角色上。\n` +
        buildFieldsSchema(charSchemaFields)
    );
    valueSections.push(`${head}\n` + buildFieldsValues(charSchemaFields, charValueMap));
    responseKeys.push(`"${charKey}"（角色"${char.name}"状态）`);
  }

  if (personaActiveFields.length > 0) {
    // writing session 自带 persona_id；chat / 无 persona_id 时回退到 active persona
    const personaDefaults = session?.persona_id
      ? getAllPersonaStateValuesByPersonaId(session.persona_id)
      : getAllPersonaStateValues(worldId);
    personaValueMap = mergeSessionValues(
      buildValueMap(personaDefaults),
      getSessionPersonaStateValues(sessionId, worldId)
    );
    const head = `=== 玩家状态 ===`;
    schemaSections.push(
      `${head}\n` +
        `注意：只追踪玩家自身的变化，勿将角色的经历记录为玩家的状态。\n` +
        buildFieldsSchema(personaActiveFields)
    );
    valueSections.push(`${head}\n` + buildFieldsValues(personaActiveFields, personaValueMap));
    responseKeys.push('"persona"（玩家状态）');
  }

  return { schemaSections, valueSections, responseKeys, worldValueMap, charValueMaps, personaValueMap };
}

// ── 值格式化 ─────────────────────────────────────────────────────────────
// 值校验（validateValue）已提取至 backend/utils/state-field-validate.js，供本文件与
// backend/services/state-extract.js 共用，避免同一套类型规则出现两份实现。

function formatValueForPrompt(valueJson, field) {
  if (valueJson == null) return '（未设置）';

  // 兼容旧数据：无 default_value 的空字符串/空数组本质上是历史占位值，
  // 应继续视为"未设置"，让自动补全有机会运行。
  if (field.default_value == null) {
    if (field.type === 'text' && valueJson === '""') return '（未设置）';
    if (field.type === 'list' && valueJson === '[]') return '（未设置）';
  }

  return valueJson;
}

// ── 状态记忆：档案字段清单 / NPC 适用用户字段（state-update.md 稳定前缀用） ─────────

const PROFILE_ENTITY_TYPE_LABELS = {
  character: '角色', location: '地点', item: '物品', faction: '组织', other: '其他', player: '玩家',
};

/** 档案字段一行说明：key、中文名、可变性，及 list_add-only / 高门槛 list 的额外约束提示。 */
function formatProfileFieldLine(field) {
  const bits = [field.mutability];
  if (field.appendOnly) bits.push('只能 list_add');
  else if (field.highBar) bits.push('每轮最多一次 list_add/list_remove，不可整体替换');
  else if (field.kind === 'list') bits.push('list');
  return `- ${field.key}（${field.label}，${bits.join('，')}）`;
}

/**
 * 本世界启用的状态记忆档案字段清单，按实体类型分组：
 * character / player 按 resolveActiveProfileFields 过滤同义停用字段，其余类型全量列出。
 * 只依赖世界 schema，逐字节稳定，供 cacheableSystem 使用。
 */
export function buildStateMemoryProfileFieldsSchema(worldId) {
  return ENTITY_TYPES
    .map((type) => {
      const defs = getProfileFieldDefinitions(type);
      const activeKeys = type === 'character' || type === 'player'
        ? new Set(resolveActiveProfileFields(worldId, type))
        : new Set(defs.map((f) => f.key));
      const filtered = defs.filter((f) => activeKeys.has(f.key));
      if (filtered.length === 0) return null;
      return `【${PROFILE_ENTITY_TYPE_LABELS[type] ?? type}】\n${filtered.map(formatProfileFieldLine).join('\n')}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * 本世界 NPC 适用的用户状态字段（update_mode='llm_auto' 且 nearby_enabled=1 的角色字段），
 * 可通过顶层 `entity_fields` 写入。渲染格式与其他字段 schema 一致，复用 buildFieldsSchema。
 */
export function buildNpcApplicableFieldsSchema(worldId) {
  const fields = worldId
    ? getCharacterStateFieldsByWorldId(worldId).filter((f) => f.update_mode === 'llm_auto' && Number(f.nearby_enabled) === 1)
    : [];
  return fields.length ? buildFieldsSchema(fields) : '';
}

// ── 状态更新调用编排：基线捕获 / 轮号解析 / 基础实体 / 真实日期 / 相关实体（updateAllStates 用） ──

/**
 * 首轮前状态基线捕获（回滚锚点）。
 * 在本轮任何状态写入之前、且仅当基线尚未存在时，把当前 session 状态（= 用户首轮前手动预设）
 * 不可变地存为基线。重生成第一轮会把所有 turn record 删光，届时回滚拿不到轮次快照，
 * 改用此基线还原，既保住手动预设，又丢弃被重生成轮次的状态污染。
 * gate 必须是「基线不存在」而非「无 turn record」——重生成首轮时 turn record 已被删空，
 * 但此时 session 状态仍是污染态，setSessionStateBaselineIfAbsent 的 IS NULL 条件保证不会被覆盖。
 */
export function captureBaselineIfAbsent(sessionId, worldId, characterIds) {
  if (!worldId) return;
  const baseline = captureFullSnapshot(sessionId, worldId, characterIds || []);
  setSessionStateBaselineIfAbsent(sessionId, JSON.stringify(baseline));
}

/** 本轮轮号 + 本轮原文（user+assistant 拼接，供 evidence 核验与地点解析用）。 */
export function resolveCurrentRound(messages) {
  const currentRound = splitRounds(messages).at(-1) ?? null;
  const round = currentRound?.roundIndex ?? 0;
  const turnText = (currentRound?.messages ?? [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => m.content)
    .join('\n');
  return { round, turnText };
}

/** 首轮建好基础实体：玩家（人设名）+ 对话模式主角色（第一个角色卡）；写作模式主角色为 null。 */
export function resolveBaseEntities({ session, worldId, sessionId, round, characters, isWriting }) {
  const mainCharacterCard = !isWriting && characters[0] ? { id: characters[0].id, name: characters[0].name } : null;
  const persona = session?.persona_id
    ? getPersonaById(session.persona_id)
    : (worldId ? getPersonaByWorldId(worldId) : null);
  return ensureBaseEntities({ sessionId, round, personaName: persona?.name, mainCharacter: mainCharacterCard });
}

/**
 * 格式化当前时间为日记时间字符串（上海时区），ISO 局部时间 "YYYY-MM-DDTHH:mm"
 */
function formatRealTimeDiaryStr() {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(local.getFullYear(), 4)}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
}

/** 真实日期模式：写入世界档案 time，AI 输出的 set_world time 会被丢弃。 */
export function writeRealDateWorldTime({ realDate, worldId, sessionId, round, sid }) {
  if (!realDate || !worldId) return;
  const timeStr = formatRealTimeDiaryStr();
  upsertWorldProfile(sessionId, 'time', timeStr, null, round);
  log.info(`REAL TIME  ${formatMeta({ session: sid, time: timeStr })}`);
}

/** 与本轮相关的实体 id 集合：选取规则命中的实体 + player + 对话模式主角色，供 renderEntityDetailsForUpdate 使用。 */
export function resolveRelevantEntityIds(sessionId, messages, { playerEntityId, mainCharacterEntityId }) {
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant')?.content ?? '';
  const relevantIds = new Set(
    selectRelevantEntities(sessionId, { userMessage: lastUserMessage, lastAssistant: lastAssistantMessage })
      .map((r) => r.entityId),
  );
  if (playerEntityId) relevantIds.add(playerEntityId);
  if (mainCharacterEntityId) relevantIds.add(mainCharacterEntityId);
  return relevantIds;
}

/** 状态更新调用的动态后缀（user 段）：各字段当前取值 + 实体目录/世界事实/相关实体详情 + 本轮对话，逐轮变化，不进缓存。 */
export function buildRuntimeUserPrompt({ sessionId, worldId, mainCharacterEntityId, valueSections, dialogue, responseKeys, round, relevantIds }) {
  return renderBackendPrompt('state-update-runtime.md', {
    VALUES: valueSections.join('\n\n'),
    DIALOGUE: dialogue,
    RESPONSE_KEYS: responseKeys.join('、'),
    ROUND: round,
    ENTITY_DIRECTORY: renderEntityDirectory(sessionId) || '（无）',
    WORLD_FACTS: renderWorldFactsForUpdate(sessionId) || '（无）',
    ENTITY_DETAILS: renderEntityDetailsForUpdate(sessionId, [...relevantIds], { worldId, mainCharacterEntityId }) || '（无）',
  });
}
