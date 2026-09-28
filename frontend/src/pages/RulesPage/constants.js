import {
  listWorldStateFields, createWorldStateField, updateWorldStateField, deleteWorldStateField,
} from '../../core/api/world-state-fields';
import {
  listCharacterStateFields, createCharacterStateField, updateCharacterStateField, deleteCharacterStateField,
} from '../../core/api/character-state-fields';
import {
  listPersonaStateFields, createPersonaStateField, updatePersonaStateField, deletePersonaStateField,
} from '../../core/api/persona-state-fields';
import { getWorldStateValues, updateWorldStateValue } from '../../core/api/world-state-values';
import { getCharacterStateValues, updateCharacterStateValue } from '../../core/api/character-state-values';
import { getPersonaStateValuesByPersonaId, updatePersonaStateValueByPersonaId } from '../../core/api/persona-state-values';
import { getCharactersByWorld } from '../../core/api/characters';
import { listPersonas } from '../../core/api/personas';

// 三种作用域的配置：字段模板 CRUD + 实例列表 + 实例默认值读写。
// cnScope 是状态条件 target_field 里用的中文作用域名（'世界.字段名'）。
export const SCOPES = {
  world: {
    key: 'world', label: '世界', cnScope: '世界',
    listFn: listWorldStateFields, createFn: createWorldStateField,
    updateFn: updateWorldStateField, deleteFn: deleteWorldStateField,
    // 世界作用域只有一个实例：世界本身
    getInstances: async (worldId) => [{ id: worldId, name: '本世界' }],
    getValues: (worldId) => getWorldStateValues(worldId),
    updateValue: (worldId, _instId, fk, vj) => updateWorldStateValue(worldId, fk, vj),
  },
  character: {
    key: 'character', label: '角色', cnScope: '角色',
    listFn: listCharacterStateFields, createFn: createCharacterStateField,
    updateFn: updateCharacterStateField, deleteFn: deleteCharacterStateField,
    getInstances: (worldId) => getCharactersByWorld(worldId),
    getValues: (_worldId, charId) => getCharacterStateValues(charId),
    updateValue: (_worldId, charId, fk, vj) => updateCharacterStateValue(charId, fk, vj),
  },
  persona: {
    key: 'persona', label: '玩家', cnScope: '玩家',
    listFn: listPersonaStateFields, createFn: createPersonaStateField,
    updateFn: updatePersonaStateField, deleteFn: deletePersonaStateField,
    getInstances: (worldId) => listPersonas(worldId),
    getValues: (worldId, personaId) => getPersonaStateValuesByPersonaId(worldId, personaId),
    updateValue: (worldId, personaId, fk, vj) => updatePersonaStateValueByPersonaId(worldId, personaId, fk, vj),
  },
};
export const FIELD_SCOPE_KEYS = ['world', 'character', 'persona'];

export const TYPE_LABEL = { text: '文本', number: '数值', boolean: '布尔', enum: '枚举', list: '列表', datetime: '时间', table: '表格' };

export const TRIGGER_TYPES = [
  { key: 'always', label: '一直生效', desc: '始终注入' },
  { key: 'keyword', label: '出现关键词', desc: '对话中出现指定词语时自动注入' },
  { key: 'llm', label: 'AI 判断相关', desc: '由 AI 判断当前情境是否需要注入' },
  { key: 'state', label: '状态满足条件', desc: '当状态字段满足设定条件时自动注入' },
];
export const TRIGGER_LABEL = Object.fromEntries(TRIGGER_TYPES.map((t) => [t.key, t.label]));
