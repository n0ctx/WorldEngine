/**
 * persona-state-updater.js — 对话后异步更新玩家状态
 *
 * 调用方：异步队列，优先级 2（不可丢弃）。
 * 只处理 update_mode = 'llm_auto' 的字段，根据 trigger_mode 决定是否参与本轮更新。
 */

import * as llm from '../llm/index.js';
import { getMessagesBySessionId } from '../services/sessions.js';
import { getSessionById } from '../db/queries/sessions.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getPersonaStateFieldsByWorldId } from '../db/queries/persona-state-fields.js';
import { getAllPersonaStateValues, upsertPersonaStateValue } from '../db/queries/persona-state-values.js';
import { PROMPT_ENTRY_SCAN_WINDOW } from '../utils/constants.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('persona-state');

/**
 * 更新指定世界的玩家状态值。
 *
 * @param {string} worldId
 * @param {string} sessionId
 */
export async function updatePersonaState(worldId, sessionId) {
  const sid = sessionId.slice(0, 8);

  // 尝试从会话中获取角色名，用于在 prompt 中明确区分双方
  const session = getSessionById(sessionId);
  const character = session?.character_id ? getCharacterById(session.character_id) : null;
  const characterName = character?.name || '角色';

  log.debug(`START  world=${worldId.slice(0, 8)}  session=${sid}`);

  // 获取该世界的所有玩家状态字段，筛选 llm_auto
  const allFields = getPersonaStateFieldsByWorldId(worldId);
  const autoFields = allFields.filter((f) => f.update_mode === 'llm_auto');
  if (autoFields.length === 0) {
    log.debug(`SKIP no llm_auto fields  world=${worldId.slice(0, 8)}`);
    return;
  }

  // 获取会话消息
  const messages = getMessagesBySessionId(sessionId, 9999, 0);
  if (messages.length === 0) return;

  // 近期文本（用于关键词命中判断）
  const recentText = messages
    .slice(-PROMPT_ENTRY_SCAN_WINDOW)
    .map((m) => m.content)
    .join('\n')
    .toLowerCase();

  // 根据 trigger_mode 筛选本轮候选字段
  const activeFields = autoFields.filter((field) => {
    if (field.trigger_mode === 'manual_only') return false;
    if (field.trigger_mode === 'every_turn') return true;
    if (field.trigger_mode === 'keyword_based') {
      if (!field.trigger_keywords || field.trigger_keywords.length === 0) return false;
      return field.trigger_keywords.some((kw) => recentText.includes(kw.toLowerCase()));
    }
    return false;
  });

  if (activeFields.length === 0) {
    log.debug(`SKIP no active fields this turn  world=${worldId.slice(0, 8)}`);
    return;
  }

  log.debug(`active fields=${activeFields.map((f) => f.field_key).join(',')}  world=${worldId.slice(0, 8)}`);

  // 获取当前状态值
  const currentValues = getAllPersonaStateValues(worldId);
  const valueMap = Object.fromEntries(currentValues.map((v) => [v.field_key, v.value_json]));

  // 组装字段说明
  const fieldsDesc = activeFields
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
      if (f.type === 'list') {
        line += `，请返回字符串数组（如 ["条目1","条目2"]），替换整个列表`;
      }
      const cur = valueMap[f.field_key];
      line += `，当前值：${cur != null ? cur : '（未设置）'}`;
      if (f.update_instruction) line += `\n  更新说明：${f.update_instruction}`;
      return line;
    })
    .join('\n');

  // 组装对话上下文（最近 10 条）
  const dialogue = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-10)
    .map((m) => `${m.role === 'user' ? '玩家' : characterName}：${m.content}`)
    .join('\n');

  const prompt = [
    {
      role: 'user',
      content:
        `你是玩家状态追踪系统，专门负责追踪玩家的状态变化。\n\n` +
        `重要说明：对话中"${characterName}"一方的状态由独立的角色状态追踪系统管理，请勿根据角色的经历来更新此处字段。` +
        `只关注玩家自身发生的变化（受到伤害、情绪变化、获得或失去物品等），不要将角色的经历记录为玩家的状态。\n\n` +
        `候选状态字段（均为玩家的属性）：\n${fieldsDesc}\n\n` +
        `最近对话：\n${dialogue}\n\n` +
        `要求：\n` +
        `1. 仅返回确实发生了变化的字段，没有变化则返回空对象 {}\n` +
        `2. 返回格式为 JSON 对象，key 为字段名，value 为新值，类型必须与字段类型一致\n` +
        `3. list 类型字段的 value 必须是字符串数组，替换整个列表\n` +
        `4. OOC（角色扮演之外的讨论）不应直接改变状态，除非是明确的设定修改指令\n` +
        `5. 不要添加任何解释，只返回 JSON\n\n` +
        `示例：{"mood": "开心", "health": 85, "items": ["长剑","急救包"]}`,
    },
  ];

  const raw = await llm.complete(prompt, { temperature: 0.3, maxTokens: 500 });
  if (!raw) return;

  // 解析 LLM 返回的 JSON patch
  let patch;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return;
    patch = JSON.parse(match[0]);
  } catch {
    log.warn(`JSON parse failed  world=${worldId.slice(0, 8)}  raw="${raw.slice(0, 100)}"`);
    return;
  }

  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return;

  const updatedKeys = [];

  // 字段 map，用于校验
  const fieldMap = Object.fromEntries(activeFields.map((f) => [f.field_key, f]));

  // 校验并写入合法字段
  for (const [key, rawValue] of Object.entries(patch)) {
    const field = fieldMap[key];
    if (!field) continue;

    const validated = validateValue(rawValue, field);
    if (validated === undefined) continue;

    const valueJson = validated === null ? null : JSON.stringify(validated);
    upsertPersonaStateValue(worldId, key, valueJson);
    updatedKeys.push(`${key}=${valueJson}`);
  }

  if (updatedKeys.length > 0) {
    log.info(`DONE  world=${worldId.slice(0, 8)}  updates: ${updatedKeys.join('  ')}`);
  } else {
    log.debug(`DONE no changes  world=${worldId.slice(0, 8)}`);
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
