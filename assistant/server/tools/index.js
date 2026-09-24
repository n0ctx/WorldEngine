// 暴露给写卡助手的工具。参数只含需要模型创作或判断的内容，其余由工作区补齐。

import { CREATE_KINDS } from '../workspace/index.js';
import { ENTRY_FIELDS } from '../workspace/entries.js';
import { FIELD_FIELDS } from '../workspace/fields.js';
import { CHARACTER_FIELDS, PERSONA_FIELDS } from '../workspace/cards.js';
import { WORLD_FIELDS } from '../workspace/world.js';
import { CSS_FIELDS, REGEX_FIELDS, THEME_FIELDS } from '../workspace/style.js';
import { REF_HELP } from '../workspace/refs.js';
import { wrapToolEvents } from './adapter.js';

const DATA_FIELDS_HELP = [
  `world: ${WORLD_FIELDS.join(', ')}`,
  `entry: ${ENTRY_FIELDS.join(', ')}（trigger: always/keyword/llm/state；conditions: [{ field: "玩家.生命", op: "<", value: 30 }]）`,
  `field: ${FIELD_FIELDS.join(', ')}（target: world/persona/character；type: number/text/enum/list/boolean/datetime/table；default 写原生值）`,
  `character: ${CHARACTER_FIELDS.join(', ')}`,
  `persona: ${PERSONA_FIELDS.join(', ')}（state: { 字段标签: 原生值 }）`,
  `css: ${CSS_FIELDS.join(', ')}`,
  `regex: ${REGEX_FIELDS.join(', ')}（scope: display_only/ai_output/user_input/prompt_only）`,
  `theme: ${THEME_FIELDS.join(', ')}`,
  'config: 全局设置的局部补丁，如 { "global_system_prompt": "…" }',
].join('\n');

// 底层校验报错带有内部结构前缀，去掉后模型更容易对上自己写的字段。
function humanizeError(message) {
  return String(message ?? '未知错误')
    .replace(/^提案格式错误：/, '')
    .replace(/^提案校验失败，未做任何改动（validate-all-then-apply）：\n?/, '')
    .replace(/(entryOps|stateFieldOps|stateValueOps)\[\d+\]\.?/g, '')
    .replace(/changes\./g, '');
}

const WRITE_TOOLS = new Set(['create', 'update', 'edit', 'set_state', 'delete']);

function defineTool(name, description, properties, required, run, describe) {
  return {
    type: 'function',
    function: { name, description, parameters: { type: 'object', properties, required } },
    describe,
    recordResult: WRITE_TOOLS.has(name),
    execute: async (args = {}) => {
      try {
        return await run(args);
      } catch (err) {
        return { success: false, error: humanizeError(err?.message) };
      }
    },
  };
}

const label = (data) => data?.name ?? data?.title ?? data?.label ?? '';
const kindOf = (ref) => String(ref ?? '').split(/[:@]/)[0];

export function buildTools(workspace) {
  return [
    defineTool(
      'read',
      `读取资源或列表，返回当前内容。${REF_HELP}`,
      { ref: { type: 'string', description: '资源引用，如 world、entry:<id>、field:persona.生命、characters、doc:world' } },
      ['ref'],
      ({ ref }) => workspace.read(ref),
      ({ ref }) => ({ summary: ref }),
    ),
    defineTool(
      'create',
      `新建资源，返回新资源的 ref。data 可用字段：\n${DATA_FIELDS_HELP}`,
      {
        kind: { type: 'string', enum: CREATE_KINDS },
        data: { type: 'object', description: '新资源的内容' },
        world: { type: 'string', description: '建在哪个世界，省略则为当前世界' },
      },
      ['kind', 'data'],
      ({ kind, data, world }) => workspace.create(kind, data, world),
      ({ kind, data }) => ({ summary: `${kind} ${label(data)}`.trim(), target: kind }),
    ),
    defineTool(
      'update',
      '修改资源，data 只写要改的字段（字段同 create）。',
      {
        ref: { type: 'string' },
        data: { type: 'object', description: '要修改的字段' },
      },
      ['ref', 'data'],
      ({ ref, data }) => workspace.update(ref, data),
      ({ ref }) => ({ summary: ref, target: kindOf(ref) }),
    ),
    defineTool(
      'edit',
      '替换资源某个长文本字段里的一段原文（如 content、system_prompt、first_message、css）。old_text 必须与原文逐字一致且只出现一次。',
      {
        ref: { type: 'string' },
        field: { type: 'string', description: '文本字段名；全局设置可写点路径，如 writing.global_system_prompt' },
        old_text: { type: 'string' },
        new_text: { type: 'string' },
      },
      ['ref', 'field', 'old_text', 'new_text'],
      ({ ref, field, old_text: oldText, new_text: newText }) => workspace.edit(ref, field, oldText, newText),
      ({ ref, field }) => ({ summary: `${ref} ${field ?? ''}`.trim(), target: kindOf(ref) }),
    ),
    defineTool(
      'set_state',
      '设置角色卡或玩家卡的初始状态值。values 的键写字段标签或 key，值写原生值（数字、数组、布尔…），null 表示清空。',
      {
        ref: { type: 'string', description: 'character:<id>，或 persona（当前激活玩家卡）/ persona:<id>' },
        values: { type: 'object' },
      },
      ['ref', 'values'],
      ({ ref, values }) => workspace.setState(ref, values),
      ({ ref }) => ({ summary: ref, target: kindOf(ref) }),
    ),
    defineTool(
      'delete',
      '删除资源。删除世界、角色卡前必须先得到用户明确同意。',
      { ref: { type: 'string' } },
      ['ref'],
      ({ ref }) => workspace.remove(ref),
      ({ ref }) => ({ summary: ref, target: kindOf(ref) }),
    ),
    defineTool(
      'find',
      '在当前世界的条目、字段、角色卡、玩家卡，以及 CSS 片段、正则规则、参考文档中搜索关键词。',
      { query: { type: 'string' } },
      ['query'],
      ({ query }) => workspace.find(query),
      ({ query }) => ({ summary: query }),
    ),
  ];
}

export function buildWrappedTools(workspace, emitFn, opts = {}) {
  return buildTools(workspace).map((tool) => wrapToolEvents(tool, emitFn, opts));
}
