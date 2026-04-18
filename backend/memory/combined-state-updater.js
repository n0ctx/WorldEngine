/**
 * combined-state-updater.js — 单次 LLM 调用同时更新世界/角色（可多个）/玩家状态
 *
 * 调用方：异步队列，优先级 2（不可丢弃）。
 * 替代原来三个独立 updater（character/world/persona-state-updater.js）。
 */

import * as llm from '../llm/index.js';
import { getMessagesBySessionId } from '../services/sessions.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getWorldById } from '../db/queries/worlds.js';

import { getWorldStateFieldsByWorldId } from '../db/queries/world-state-fields.js';
import { getAllWorldStateValues, upsertWorldStateValue } from '../db/queries/world-state-values.js';

import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import { getAllCharacterStateValues, upsertCharacterStateValue } from '../db/queries/character-state-values.js';

import { getPersonaStateFieldsByWorldId } from '../db/queries/persona-state-fields.js';
import { getAllPersonaStateValues, upsertPersonaStateValue } from '../db/queries/persona-state-values.js';

import { PROMPT_ENTRY_SCAN_WINDOW, ALL_MESSAGES_LIMIT } from '../utils/constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('all-state');

/**
 * 单次 LLM 调用同时更新世界/角色（可多个）/玩家状态。
 *
 * @param {string|null} worldId
 * @param {string[]} characterIds  chat 模式传 [characterId]，写作模式传多个
 * @param {string} sessionId
 */
export async function updateAllStates(worldId, characterIds, sessionId) {
  const sid = sessionId.slice(0, 8);
  const world = worldId ? getWorldById(worldId) : null;

  const messages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  if (messages.length === 0) return;

  // 近期文本用于 keyword_based 触发判断
  const recentText = messages
    .slice(-PROMPT_ENTRY_SCAN_WINDOW)
    .map((m) => m.content)
    .join('\n')
    .toLowerCase();

  function filterActive(fields) {
    return fields.filter((f) => {
      if (f.update_mode !== 'llm_auto') return false;
      if (f.trigger_mode === 'manual_only') return false;
      if (f.trigger_mode === 'every_turn') return true;
      if (f.trigger_mode === 'keyword_based') {
        if (!f.trigger_keywords?.length) return false;
        return f.trigger_keywords.some((kw) => recentText.includes(kw.toLowerCase()));
      }
      return false;
    });
  }

  // ── 世界活跃字段 ──
  const worldActiveFields = world ? filterActive(getWorldStateFieldsByWorldId(worldId)) : [];

  // ── 各角色活跃字段（同一世界共享 schema，只取一次） ──
  const characters = (characterIds || []).map((id) => getCharacterById(id)).filter(Boolean);
  // 角色状态字段 schema 由 world_id 决定，取第一个有效角色的 world_id
  const charWorldId = characters[0]?.world_id ?? worldId;
  const charSchemaFields = charWorldId ? filterActive(getCharacterStateFieldsByWorldId(charWorldId)) : [];
  const charactersWithFields = charSchemaFields.length > 0 ? characters : [];

  // ── 玩家活跃字段 ──
  const personaActiveFields = world ? filterActive(getPersonaStateFieldsByWorldId(worldId)) : [];

  if (worldActiveFields.length === 0 && charactersWithFields.length === 0 && personaActiveFields.length === 0) {
    log.debug(`SKIP no active fields  session=${sid}`);
    return;
  }

  // 对话标注用名（用第一个角色名，没有则"角色"）
  const primaryName = characters[0]?.name ?? '角色';

  function buildFieldsDesc(fields, valueMap) {
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
        }
        if (f.type === 'list') line += `，请返回字符串数组（如 ["条目1","条目2"]），替换整个列表`;
        const cur = valueMap[f.field_key] ?? { defaultValueJson: f.default_value ?? null, runtimeValueJson: null };
        line += `，默认值：${formatValueForPrompt(cur.defaultValueJson, f)}，当前运行时值：${formatValueForPrompt(cur.runtimeValueJson, f)}`;
        if (f.update_instruction) line += `\n  更新说明：${f.update_instruction}`;
        return line;
      })
      .join('\n');
  }

  // ── 组装 prompt 各节 ──
  const sections = [];
  const responseKeys = [];

  if (worldActiveFields.length > 0) {
    const valueMap = Object.fromEntries(
      getAllWorldStateValues(worldId).map((v) => [v.field_key, {
        defaultValueJson: v.default_value_json,
        runtimeValueJson: v.runtime_value_json,
      }])
    );
    sections.push(`=== 世界状态（"${world.name}"）===\n` + buildFieldsDesc(worldActiveFields, valueMap));
    responseKeys.push('"world"（世界状态）');
  }

  for (let i = 0; i < charactersWithFields.length; i++) {
    const char = charactersWithFields[i];
    const charKey = `char_${i}`;
    const valueMap = Object.fromEntries(
      getAllCharacterStateValues(char.id).map((v) => [v.field_key, {
        defaultValueJson: v.default_value_json,
        runtimeValueJson: v.runtime_value_json,
      }])
    );
    sections.push(
      `=== 角色状态（key="${charKey}"，角色名"${char.name}"）===\n` +
        `注意：只追踪"${char.name}"自身的状态变化。与"${char.name}"直接相关、并真实发生在其身上的共同经历（如受伤、获得报酬、装备损耗、位置变化）也应计入角色状态；仅玩家独有的变化不要记到角色上。\n` +
        buildFieldsDesc(charSchemaFields, valueMap)
    );
    responseKeys.push(`"${charKey}"（角色"${char.name}"状态）`);
  }

  if (personaActiveFields.length > 0) {
    const valueMap = Object.fromEntries(
      getAllPersonaStateValues(worldId).map((v) => [v.field_key, {
        defaultValueJson: v.default_value_json,
        runtimeValueJson: v.runtime_value_json,
      }])
    );
    sections.push(
      `=== 玩家状态 ===\n` +
        `注意：只追踪玩家自身的变化，勿将角色的经历记录为玩家的状态。\n` +
        buildFieldsDesc(personaActiveFields, valueMap)
    );
    responseKeys.push('"persona"（玩家状态）');
  }

  // 对话上下文（最近 10 条）
  const dialogue = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-10)
    .map((m) => `${m.role === 'user' ? '玩家' : primaryName}：${m.content}`)
    .join('\n');

  const exampleKeys = [
    worldActiveFields.length > 0 ? '"world": {"date": "第三纪元第101年"}' : null,
    charactersWithFields[0] ? '"char_0": {"mood": "开心"}' : null,
    personaActiveFields.length > 0 ? '"persona": {"health": 85}' : null,
  ]
    .filter(Boolean)
    .join(', ');

  const prompt = [
    {
      role: 'user',
      content:
        `你是状态追踪系统，根据对话内容同时更新以下各类状态。\n\n` +
        sections.join('\n\n') +
        `\n\n最近对话：\n${dialogue}\n\n` +
        `要求：\n` +
        `1. 返回 JSON 对象，顶层 key 必须为：${responseKeys.join('、')}\n` +
        `2. 你必须逐个判断每个顶层 key：world、每个 char_x、persona。若某个 key 没有任何可更新字段，也必须返回该 key 对应的空对象 {}\n` +
        `3. 空值补全规则：若某字段默认值和当前运行时值都为（未设置），且对话里有明确线索，可以为它填写首次值；若线索不足则不要猜测\n` +
        `4. 默认值是稳定基线，当前运行时值是临时状态；若默认值已存在且当前运行时值为空，不要仅因重复提及默认设定就写入字段，只有出现明确偏离默认值的新事实时才更新\n` +
        `5. list 类型字段的 value 必须是字符串数组，替换整个列表\n` +
        `6. OOC 讨论不应直接改变状态，除非是明确的设定修改指令\n` +
        `7. 不要添加任何解释，只返回 JSON\n\n` +
        `示例：{${exampleKeys}}`,
    },
  ];

  log.debug(
    `CALL  world=${worldActiveFields.length}f  chars=[${charactersWithFields.map((c) => c.name).join(',')}]  persona=${personaActiveFields.length}f  session=${sid}`
  );

  const raw = await llm.complete(prompt, { temperature: 0.3, maxTokens: 1000 });
  if (!raw) return;

  let patch;
  try {
    const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonSource = codeBlock ? codeBlock[1].trim() : raw;
    const match = jsonSource.match(/\{[\s\S]*\}/);
    if (!match) return;
    patch = JSON.parse(match[0]);
  } catch {
    log.warn(`JSON parse failed  session=${sid}  raw="${raw.slice(0, 100)}"`);
    return;
  }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return;

  // ── 写入世界状态 ──
  if (worldActiveFields.length > 0 && patch.world && typeof patch.world === 'object') {
    const fieldMap = Object.fromEntries(worldActiveFields.map((f) => [f.field_key, f]));
    const updated = [];
    for (const [key, rawValue] of Object.entries(patch.world)) {
      const field = fieldMap[key];
      if (!field) continue;
      const validated = validateValue(rawValue, field);
      if (validated === undefined) continue;
      const valueJson = validated === null ? null : JSON.stringify(validated);
      upsertWorldStateValue(worldId, key, { runtimeValueJson: valueJson });
      updated.push(`${key}=${valueJson}`);
    }
    if (updated.length) log.info(`world="${world.name}"  updates: ${updated.join('  ')}`);
  }

  // ── 写入各角色状态 ──
  for (let i = 0; i < charactersWithFields.length; i++) {
    const char = charactersWithFields[i];
    const charPatch = patch[`char_${i}`];
    if (!charPatch || typeof charPatch !== 'object') continue;
    const fieldMap = Object.fromEntries(charSchemaFields.map((f) => [f.field_key, f]));
    const updated = [];
    for (const [key, rawValue] of Object.entries(charPatch)) {
      const field = fieldMap[key];
      if (!field) continue;
      const validated = validateValue(rawValue, field);
      if (validated === undefined) continue;
      const valueJson = validated === null ? null : JSON.stringify(validated);
      upsertCharacterStateValue(char.id, key, { runtimeValueJson: valueJson });
      updated.push(`${key}=${valueJson}`);
    }
    if (updated.length) log.info(`char="${char.name}"  updates: ${updated.join('  ')}`);
  }

  // ── 写入玩家状态 ──
  if (personaActiveFields.length > 0 && patch.persona && typeof patch.persona === 'object') {
    const fieldMap = Object.fromEntries(personaActiveFields.map((f) => [f.field_key, f]));
    const updated = [];
    for (const [key, rawValue] of Object.entries(patch.persona)) {
      const field = fieldMap[key];
      if (!field) continue;
      const validated = validateValue(rawValue, field);
      if (validated === undefined) continue;
      const valueJson = validated === null ? null : JSON.stringify(validated);
      upsertPersonaStateValue(worldId, key, { runtimeValueJson: valueJson });
      updated.push(`${key}=${valueJson}`);
    }
    if (updated.length) log.info(`persona  world="${world?.name}"  updates: ${updated.join('  ')}`);
  }
}

/**
 * 校验 LLM 返回的值是否符合字段类型约束。
 * 返回 undefined 表示校验失败（丢弃）；返回 null 表示允许空值。
 */
function validateValue(value, field) {
  if (value === null || value === undefined || value === '') {
    return field.allow_empty ? null : undefined;
  }

  switch (field.type) {
    case 'text': {
      if (typeof value !== 'string') return undefined;
      return value;
    }
    case 'number': {
      const num = typeof value === 'number' ? value : Number(value);
      if (!isFinite(num)) return undefined;
      if (field.min_value != null && num < field.min_value) return undefined;
      if (field.max_value != null && num > field.max_value) return undefined;
      return num;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return undefined;
    }
    case 'enum': {
      if (typeof value !== 'string') return undefined;
      if (field.enum_options && !field.enum_options.includes(value)) return undefined;
      return value;
    }
    case 'list': {
      if (typeof value === 'string') {
        value = value.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
      }
      if (!Array.isArray(value)) return undefined;
      const items = value.map(String).filter(Boolean);
      if (items.length === 0) return field.allow_empty ? [] : undefined;
      return items;
    }
    default:
      return undefined;
  }
}

function formatValueForPrompt(valueJson, field) {
  if (valueJson == null) return '（未设置）';

  // 兼容旧数据：无 default_value 的空字符串/空数组本质上是历史占位值，
  // 应继续视为“未设置”，让自动补全有机会运行。
  if (field.default_value == null) {
    if (field.type === 'text' && valueJson === '""') return '（未设置）';
    if (field.type === 'list' && valueJson === '[]') return '（未设置）';
  }

  return valueJson;
}
