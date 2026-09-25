/**
 * state-extract.js — 从角色卡 / 玩家卡人设正文推断该世界下全部状态字段的建议值。
 *
 * 只读、只推断，不写库：写库由前端在用户勾选确认后走既有的状态值写入接口
 * （PATCH .../state-values/:fieldKey）。
 *
 * 人设为空（name/description/system_prompt 全空）时直接返回空数组，不占用一次 LLM 调用。
 * 每个字段的建议值都经过 validateValue（backend/utils/state-field-validate.js）校验，
 * 校验不过直接丢弃该字段，不让整体调用失败。
 */

import * as llm from '../llm/index.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getPersonaById } from '../db/queries/personas.js';
import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import { getAllCharacterStateValues } from '../db/queries/character-state-values.js';
import { getPersonaStateFieldsByWorldId } from '../db/queries/persona-state-fields.js';
import { getAllPersonaStateValuesByPersonaId } from '../db/queries/persona-state-values.js';
import { validateValue } from '../utils/state-field-validate.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { stripThinkBlocksFromText } from '../utils/turn-dialogue.js';
import { LLM_TASK_TEMPERATURE, LLM_STATE_UPDATE_MAX_TOKENS, STATE_TEXT_MAX_LENGTH, STATE_LIST_MAX_ITEMS } from '../utils/constants.js';
import { createLogger, formatMeta, previewText } from '../utils/logger.js';

const log = createLogger('state-extract', 'cyan');

/**
 * 拼接人设正文各段落（description / system_prompt / post_prompt）。
 * @param {{ description?: string, system_prompt?: string, post_prompt?: string }} card
 * @returns {string}
 */
function buildPersonaText(card) {
  const parts = [];
  if (typeof card.description === 'string' && card.description.trim()) {
    parts.push(`【人设简介】\n${card.description.trim()}`);
  }
  if (typeof card.system_prompt === 'string' && card.system_prompt.trim()) {
    parts.push(`【系统提示词】\n${card.system_prompt.trim()}`);
  }
  if (typeof card.post_prompt === 'string' && card.post_prompt.trim()) {
    parts.push(`【补充设定】\n${card.post_prompt.trim()}`);
  }
  return parts.join('\n\n');
}

/**
 * 把字段定义列表渲染为「schema」文本段，供 LLM 推断时参考约束。
 */
function buildFieldsSchemaText(fields) {
  return fields
    .map((f) => {
      let line = `- ${f.field_key}（${f.label}，类型：${f.type}）`;
      if (f.description) line += `，说明：${f.description}`;
      if (f.type === 'enum' && f.enum_options?.length) {
        line += `，可选值：[${f.enum_options.join(' / ')}]`;
      }
      if (f.type === 'number') {
        const lo = f.min_value != null ? f.min_value : '不限';
        const hi = f.max_value != null ? f.max_value : '不限';
        line += `，范围：${lo} ~ ${hi}`;
      }
      if (f.type === 'list') line += `，请返回字符串数组（如 ["条目1","条目2"]）`;
      if (f.type === 'datetime') line += `，请返回 ISO 局部时间字符串 "YYYY-MM-DDTHH:mm"`;
      if (f.update_instruction) line += `\n  更新说明：${f.update_instruction}`;
      return line;
    })
    .join('\n');
}

/**
 * 从 LLM 原始输出中解析 JSON 建议对象。剥离 <think> 块 + ```json 代码块包裹后提取首个 {...}。
 * @returns {object|null}
 */
function parseSuggestionJson(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const stripped = stripThinkBlocksFromText(raw).trim();
  if (!stripped) return null;
  const codeBlock = stripped.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = codeBlock ? codeBlock[1].trim() : stripped;
  const objMatch = candidate.match(/\{[\s\S]*\}/);
  const source = objMatch ? objMatch[0] : candidate;
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

/**
 * 校验 + 汇总建议结果：逐字段用 validateValue 校验 LLM 输出，
 * 校验不过或值为空的字段直接丢弃，不返回该字段的建议。
 *
 * @param {object[]} fields    该世界下全部状态字段定义
 * @param {Record<string, {default_value_json: string|null, runtime_value_json: string|null}>} valueMap
 * @param {object} suggestions LLM 返回的 { field_key: rawValue } 对象
 * @returns {Array<{ field_key, label, type, current_value_json, suggested_value_json }>}
 *
 * current_value_json 直接透传 character_state_values/persona_state_values 里的原始存储值，
 * suggested_value_json 则始终是 JSON.stringify(validateValue(...)) 的合法 JSON。这两者的格式
 * 不对称是存量约定：text/enum 类型字段的种子默认值（见 utils/default-state-fields.js）落库时是
 * 裸字符串（如 '晴'、''），不是合法 JSON；一旦字段被 LLM 回合更新写入过运行时值，则该值必然是
 * validateValue 校验后 JSON.stringify 的结果，合法 JSON。因此 current_value_json 可能是合法 JSON
 * 也可能是裸字符串，前端消费时必须复用 StateValueField.jsx 的 parseJsonValue（JSON.parse 失败时
 * 回退为原始字符串）那套容错解析，不能假设一定能 JSON.parse 成功。
 */
function buildResult(fields, valueMap, suggestions) {
  const result = [];
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(suggestions, field.field_key)) continue;

    const rawValue = suggestions[field.field_key];
    const validated = validateValue(rawValue, field);
    if (validated === undefined || validated === null) {
      log.warn(`DROP  ${formatMeta({ key: field.field_key, type: field.type, raw: previewText(JSON.stringify(rawValue)) })}`);
      continue;
    }

    const row = valueMap[field.field_key];
    const currentValueJson = row ? (row.runtime_value_json ?? row.default_value_json ?? null) : null;

    result.push({
      field_key: field.field_key,
      label: field.label,
      type: field.type,
      current_value_json: currentValueJson,
      suggested_value_json: JSON.stringify(validated),
    });
  }
  return result;
}

/**
 * 调 LLM 分析人设正文，推断全部字段的建议值（未过校验的字段已被丢弃）。
 */
async function callExtractLLM({ name, personaText, fields, callType }) {
  const prompt = renderBackendPrompt('state-extract.md', {
    NAME: name || '（未命名）',
    PERSONA_TEXT: personaText,
    SCHEMA: buildFieldsSchemaText(fields),
    TEXT_MAX_LENGTH: STATE_TEXT_MAX_LENGTH,
    LIST_MAX_ITEMS: STATE_LIST_MAX_ITEMS,
  });

  const raw = await llm.complete([{ role: 'user', content: prompt }], {
    temperature: LLM_TASK_TEMPERATURE,
    maxTokens: LLM_STATE_UPDATE_MAX_TOKENS,
    configScope: 'aux',
    callType,
  });

  if (!raw) {
    const err = new Error('LLM 调用失败，未返回内容');
    err.code = 'LLM_CALL_FAILED';
    throw err;
  }

  const parsed = parseSuggestionJson(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    log.warn(`PARSE FAIL  ${formatMeta({ name, preview: previewText(raw) })}`);
    const err = new Error('LLM 返回内容无法解析为 JSON');
    err.code = 'LLM_PARSE_FAILED';
    throw err;
  }
  return parsed;
}

/**
 * 提取某角色在其所属世界下全部角色状态字段的建议值。
 * @param {string} characterId
 * @returns {Promise<Array<{ field_key, label, type, current_value_json, suggested_value_json }>>}
 */
export async function extractCharacterStateSuggestions(characterId) {
  const character = getCharacterById(characterId);
  if (!character) {
    const err = new Error('角色不存在');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fields = getCharacterStateFieldsByWorldId(character.world_id);
  if (fields.length === 0) return [];

  // 只有名字没有正文时无从推断，别浪费一次 LLM 调用
  const personaText = buildPersonaText(character);
  if (!personaText) return [];

  const valueRows = getAllCharacterStateValues(characterId);
  const valueMap = Object.fromEntries(valueRows.map((v) => [v.field_key, v]));

  const suggestions = await callExtractLLM({
    name: character.name,
    personaText,
    fields,
    callType: 'state_extract_character',
  });

  return buildResult(fields, valueMap, suggestions);
}

/**
 * 提取某玩家卡在其所属世界下全部玩家状态字段的建议值。
 * @param {string} personaId
 * @returns {Promise<Array<{ field_key, label, type, current_value_json, suggested_value_json }>>}
 */
export async function extractPersonaStateSuggestions(personaId) {
  const persona = getPersonaById(personaId);
  if (!persona) {
    const err = new Error('玩家卡不存在');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const fields = getPersonaStateFieldsByWorldId(persona.world_id);
  if (fields.length === 0) return [];

  // persona 没有 post_prompt，只有 description / system_prompt 两段正文
  const personaText = buildPersonaText(persona);
  if (!personaText) return [];

  const valueRows = getAllPersonaStateValuesByPersonaId(personaId);
  const valueMap = Object.fromEntries(valueRows.map((v) => [v.field_key, v]));

  const suggestions = await callExtractLLM({
    name: persona.name,
    personaText,
    fields,
    callType: 'state_extract_persona',
  });

  return buildResult(fields, valueMap, suggestions);
}
