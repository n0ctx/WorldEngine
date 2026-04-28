/**
 * preview_card tool
 * 允许主代理或执行子代理按需查询实体（世界/角色/玩家卡/全局配置）的完整数据。
 * loadEntityData 逻辑从 routes.js 迁移至此，按请求绑定 context。
 */

import { getWorldById } from '../../../backend/services/worlds.js';
import { getCharacterById } from '../../../backend/services/characters.js';
import { getOrCreatePersona } from '../../../backend/services/personas.js';
import { getConfig } from '../../../backend/services/config.js';
import { getAllWorldEntries } from '../../../backend/db/queries/prompt-entries.js';
import { listConditionsByEntry } from '../../../backend/db/queries/entry-conditions.js';
import { listWorldStateFields } from '../../../backend/services/world-state-fields.js';
import { listCharacterStateFields } from '../../../backend/services/character-state-fields.js';
import { getPersonaStateFieldsByWorldId } from '../../../backend/services/persona-state-fields.js';
import { getCharacterStateValuesWithFields } from '../../../backend/db/queries/character-state-values.js';
import { getPersonaStateValuesWithFields } from '../../../backend/db/queries/persona-state-values.js';
import { listCustomCssSnippets } from '../../../backend/db/queries/custom-css-snippets.js';
import { listRegexRules } from '../../../backend/db/queries/regex-rules.js';

/**
 * 创建 preview_card tool（按请求绑定 context）
 * @param {object} context  请求级上下文 { worldId, characterId, world, character }
 */
export function createPreviewCardTool(context) {
  return {
    type: 'function',
    function: {
      name: 'preview_card',
      description:
        '查询当前实体（世界卡/角色卡/玩家卡/全局配置/CSS片段/正则规则）的完整数据，包括现有 Prompt 条目和状态字段。' +
        '主代理在分发任务给执行子代理前调用此工具研究现状。' +
        'css_snippet_agent 和 regex_rule_agent 在 update/delete 时也需要调用此工具获取现有列表（create 不需要）。' +
        '也可在直接回答用户关于当前配置内容的问题时使用。',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            enum: ['world-card', 'character-card', 'persona-card', 'global-prompt', 'css-snippet', 'regex-rule'],
            description: '要查询的实体类型',
          },
          operation: {
            type: 'string',
            enum: ['create', 'update', 'delete'],
            description: '即将执行的操作（影响返回数据范围：create 时不需要现有实体数据）',
          },
          entityId: {
            type: 'string',
            description:
              '实体 ID（world-card update/delete 时为世界 ID；character-card update/delete 时为角色 ID；' +
              'persona-card 时为世界 ID）。create 操作或使用上下文默认值时可省略。',
          },
        },
        required: ['target'],
      },
    },
    execute: async ({ target, operation = 'update', entityId = null }) => {
      try {
        const data = loadEntityData(target, operation, entityId, context);
        return JSON.stringify(data, null, 2);
      } catch (err) {
        return `错误：${err.message}`;
      }
    },
  };
}

/**
 * 加载实体数据，逻辑与原 routes.js 的 loadEntityData 一致。
 */
function loadEntityData(target, operation, entityId, context) {
  const withEntryConditions = (entries) => entries.map((entry) => (
    entry.trigger_type === 'state'
      ? { ...entry, conditions: listConditionsByEntry(entry.id) }
      : entry
  ));

  const MAX_PREVIEW_ENTRIES = 100;
  const MAX_PREVIEW_FIELDS = 100;

  function maybeTruncate(arr, max, label) {
    if (!Array.isArray(arr) || arr.length <= max) return { data: arr, truncated: false, total: arr.length };
    return {
      data: arr.slice(0, max),
      truncated: true,
      total: arr.length,
      _message: `${label} 数量过多，仅返回前 ${max} 条`,
    };
  }

  if (operation === 'create') {
    if (target === 'world-card') {
      return {};
    }
    if (target === 'character-card' || target === 'persona-card') {
      const worldId = entityId || context?.worldId;
      const world = worldId ? getWorldById(worldId) : null;
      const personaSfMeta = worldId
        ? maybeTruncate(getPersonaStateFieldsByWorldId(worldId), MAX_PREVIEW_FIELDS, '玩家状态字段')
        : { data: [], truncated: false, total: 0 };
      const charSfMeta = worldId
        ? maybeTruncate(listCharacterStateFields(worldId), MAX_PREVIEW_FIELDS, '角色状态字段')
        : { data: [], truncated: false, total: 0 };
      return {
        _worldName: world?.name || '',
        _worldDescription: world?.description || '',
        existingWorldEntries: world ? withEntryConditions(getAllWorldEntries(world.id)) : [],
        existingPersonaStateFields: personaSfMeta.data,
        _existingPersonaStateFieldsMeta: personaSfMeta.truncated ? { total: personaSfMeta.total, limit: MAX_PREVIEW_FIELDS } : undefined,
        existingCharacterStateFields: charSfMeta.data,
        _existingCharacterStateFieldsMeta: charSfMeta.truncated ? { total: charSfMeta.total, limit: MAX_PREVIEW_FIELDS } : undefined,
      };
    }
    return {};
  }

  switch (target) {
    case 'world-card': {
      const worldId = entityId || context?.worldId;
      if (!worldId) throw Object.assign(new Error('请先选择一个世界，再查询世界卡'), { userFacing: true });
      const world = getWorldById(worldId);
      if (!world) throw Object.assign(new Error('找不到指定的世界，可能已被删除'), { userFacing: true });
      const entriesMeta = maybeTruncate(withEntryConditions(getAllWorldEntries(worldId)), MAX_PREVIEW_ENTRIES, '现有条目');
      const worldSfMeta = maybeTruncate(listWorldStateFields(worldId), MAX_PREVIEW_FIELDS, '世界状态字段');
      const personaSfMeta = maybeTruncate(getPersonaStateFieldsByWorldId(worldId), MAX_PREVIEW_FIELDS, '玩家状态字段');
      const charSfMeta = maybeTruncate(listCharacterStateFields(worldId), MAX_PREVIEW_FIELDS, '角色状态字段');
      return {
        ...world,
        existingEntries: entriesMeta.data,
        _existingEntriesMeta: entriesMeta.truncated ? { total: entriesMeta.total, limit: MAX_PREVIEW_ENTRIES } : undefined,
        existingWorldStateFields: worldSfMeta.data,
        _existingWorldStateFieldsMeta: worldSfMeta.truncated ? { total: worldSfMeta.total, limit: MAX_PREVIEW_FIELDS } : undefined,
        existingPersonaStateFields: personaSfMeta.data,
        _existingPersonaStateFieldsMeta: personaSfMeta.truncated ? { total: personaSfMeta.total, limit: MAX_PREVIEW_FIELDS } : undefined,
        existingCharacterStateFields: charSfMeta.data,
        _existingCharacterStateFieldsMeta: charSfMeta.truncated ? { total: charSfMeta.total, limit: MAX_PREVIEW_FIELDS } : undefined,
      };
    }
    case 'character-card': {
      const charId = entityId || context?.characterId;
      if (!charId) throw Object.assign(new Error('请先选择一个角色，再查询角色卡'), { userFacing: true });
      const character = getCharacterById(charId);
      if (!character) throw Object.assign(new Error('找不到指定的角色，可能已被删除'), { userFacing: true });
      const world = getWorldById(character.world_id);
      const charEntriesMeta = maybeTruncate(world ? withEntryConditions(getAllWorldEntries(world.id)) : [], MAX_PREVIEW_ENTRIES, '现有世界条目');
      const charCharSfMeta = maybeTruncate(listCharacterStateFields(character.world_id), MAX_PREVIEW_FIELDS, '角色状态字段');
      const charPersonaSfMeta = maybeTruncate(getPersonaStateFieldsByWorldId(character.world_id), MAX_PREVIEW_FIELDS, '玩家状态字段');
      return {
        ...character,
        existingWorldEntries: charEntriesMeta.data,
        _existingWorldEntriesMeta: charEntriesMeta.truncated ? { total: charEntriesMeta.total, limit: MAX_PREVIEW_ENTRIES } : undefined,
        existingCharacterStateFields: charCharSfMeta.data,
        _existingCharacterStateFieldsMeta: charCharSfMeta.truncated ? { total: charCharSfMeta.total, limit: MAX_PREVIEW_FIELDS } : undefined,
        existingCharacterStateValues: getCharacterStateValuesWithFields(charId),
        existingPersonaStateFields: charPersonaSfMeta.data,
        _existingPersonaStateFieldsMeta: charPersonaSfMeta.truncated ? { total: charPersonaSfMeta.total, limit: MAX_PREVIEW_FIELDS } : undefined,
        _worldName: world?.name || '',
        _worldDescription: world?.description || '',
      };
    }
    case 'persona-card': {
      const worldId = entityId || context?.worldId;
      if (!worldId) throw Object.assign(new Error('请先选择一个世界，再查询玩家卡'), { userFacing: true });
      const persona = getOrCreatePersona(worldId);
      const world = getWorldById(worldId);
      const personaEntriesMeta = maybeTruncate(world ? withEntryConditions(getAllWorldEntries(world.id)) : [], MAX_PREVIEW_ENTRIES, '现有世界条目');
      const personaSfMeta = maybeTruncate(getPersonaStateFieldsByWorldId(worldId), MAX_PREVIEW_FIELDS, '玩家状态字段');
      return {
        ...persona,
        existingWorldEntries: personaEntriesMeta.data,
        _existingWorldEntriesMeta: personaEntriesMeta.truncated ? { total: personaEntriesMeta.total, limit: MAX_PREVIEW_ENTRIES } : undefined,
        existingPersonaStateFields: personaSfMeta.data,
        _existingPersonaStateFieldsMeta: personaSfMeta.truncated ? { total: personaSfMeta.total, limit: MAX_PREVIEW_FIELDS } : undefined,
        existingPersonaStateValues: getPersonaStateValuesWithFields(worldId),
        _worldName: world?.name || '',
        _worldDescription: world?.description || '',
      };
    }
    case 'global-prompt': {
      return { ...getConfig() };
    }
    case 'css-snippet': {
      return { existingSnippets: listCustomCssSnippets() };
    }
    case 'regex-rule': {
      return { existingRules: listRegexRules() };
    }
    default:
      throw new Error(`未知的 target：${target}`);
  }
}
