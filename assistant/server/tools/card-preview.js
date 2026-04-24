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
  const needsGlobal = ['world-card', 'character-card', 'persona-card'].includes(target);
  const globalSystemPrompt = needsGlobal ? (getConfig()?.global_system_prompt || '') : '';
  const withEntryConditions = (entries) => entries.map((entry) => (
    entry.trigger_type === 'state'
      ? { ...entry, conditions: listConditionsByEntry(entry.id) }
      : entry
  ));

  if (operation === 'create') {
    if (target === 'world-card') {
      return { _globalSystemPrompt: globalSystemPrompt };
    }
    if (target === 'character-card' || target === 'persona-card') {
      const worldId = entityId || context?.worldId;
      const world = worldId ? getWorldById(worldId) : null;
      return {
        _globalSystemPrompt: globalSystemPrompt,
        _worldName: world?.name || '',
        _worldDescription: world?.description || '',
        existingWorldEntries: world ? withEntryConditions(getAllWorldEntries(world.id)) : [],
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
      return {
        ...world,
        existingEntries: withEntryConditions(getAllWorldEntries(worldId)),
        existingWorldStateFields: listWorldStateFields(worldId),
        existingPersonaStateFields: getPersonaStateFieldsByWorldId(worldId),
        existingCharacterStateFields: listCharacterStateFields(worldId),
        _globalSystemPrompt: globalSystemPrompt,
      };
    }
    case 'character-card': {
      const charId = entityId || context?.characterId;
      if (!charId) throw Object.assign(new Error('请先选择一个角色，再查询角色卡'), { userFacing: true });
      const character = getCharacterById(charId);
      if (!character) throw Object.assign(new Error('找不到指定的角色，可能已被删除'), { userFacing: true });
      const world = getWorldById(character.world_id);
      return {
        ...character,
        existingWorldEntries: world ? withEntryConditions(getAllWorldEntries(world.id)) : [],
        existingCharacterStateFields: listCharacterStateFields(character.world_id),
        existingPersonaStateFields: getPersonaStateFieldsByWorldId(character.world_id),
        _globalSystemPrompt: globalSystemPrompt,
        _worldName: world?.name || '',
        _worldDescription: world?.description || '',
      };
    }
    case 'persona-card': {
      const worldId = entityId || context?.worldId;
      if (!worldId) throw Object.assign(new Error('请先选择一个世界，再查询玩家卡'), { userFacing: true });
      const persona = getOrCreatePersona(worldId);
      const world = getWorldById(worldId);
      return {
        ...persona,
        existingWorldEntries: world ? withEntryConditions(getAllWorldEntries(world.id)) : [],
        existingPersonaStateFields: getPersonaStateFieldsByWorldId(worldId),
        _globalSystemPrompt: globalSystemPrompt,
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
