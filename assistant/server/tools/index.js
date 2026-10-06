// 暴露给写卡助手的工具。参数只含需要模型创作或判断的内容，其余由工作区补齐。

import { CREATE_KINDS, FIND_KINDS } from '../workspace/index.js';
import { ENTRY_FIELDS } from '../workspace/entries.js';
import { FIELD_FIELDS } from '../workspace/fields.js';
import { CHARACTER_FIELDS, PERSONA_FIELDS } from '../workspace/cards.js';
import { WORLD_FIELDS } from '../workspace/world.js';
import { CSS_FIELDS, REGEX_FIELDS } from '../workspace/style.js';
import { REF_HELP } from '../workspace/refs.js';
import { WRITE_TOOLS } from '../tool-meta.js';
import { createLogger, formatMeta } from '../../../backend/utils/logger.js';
import { wrapToolEvents } from './adapter.js';

const log = createLogger('as-tools', 'cyan');

const DATA_FIELDS_HELP = [
  `world: ${WORLD_FIELDS.join(', ')}（profile: { "时间": "YYYY-MM-DD", "地点": "开场地点" }，新会话开始时带入；建世界时时间必填）`,
  `entry: ${ENTRY_FIELDS.join(', ')}（trigger: always/keyword/llm/state；conditions: [{ field: "玩家.生命", op: "<", value: 30 }]；enabled: false 表示停用；order: 从 1 开始的位置）`,
  `field: ${FIELD_FIELDS.join(', ')}（target: world/persona/character；type: number/text/enum/list/boolean/datetime/table；default 写原生值）`,
  `character: ${CHARACTER_FIELDS.join(', ')}（profile: { 档案字段标签: 文本或文本列表 }，如 { "性别": "女", "核心性格": ["冷静"] }；state: { 状态字段标签: 原生值 }）`,
  `persona: ${PERSONA_FIELDS.join(', ')}（profile 同角色卡，没有人格组；state: { 字段标签: 原生值 }）`,
  `css: ${CSS_FIELDS.join(', ')}`,
  `regex: ${REGEX_FIELDS.join(', ')}（scope: display_only/ai_output/user_input/prompt_only）`,
  'config: 全局设置的局部补丁，如 { "global_system_prompt": "…" }',
].join('\n');

// 底层用的内部字段名 → 模型在 data 里写的字段名。
const INTERNAL_NAMES = {
  table_columns: 'columns',
  enum_options: 'options',
  min_value: 'min',
  max_value: 'max',
  default_value: 'default',
  nearby_enabled: 'nearby',
  field_key: 'key',
  target_field: 'field',
  trigger_type: 'trigger',
  operator: 'op',
};
const INTERNAL_NAME_RE = new RegExp(`\\b(${Object.keys(INTERNAL_NAMES).join('|')})\\b`, 'g');

// 底层校验报错带有内部结构前缀和内部字段名，换成模型自己写的写法，便于它对上并改正。
function humanizeError(message) {
  return String(message ?? '未知错误')
    .replace(/提案格式错误：/g, '')
    .replace(/提案校验失败，未做任何改动（validate-all-then-apply）：\n?/g, '')
    .replace(/(entryOps|stateFieldOps|stateValueOps)\[\d+\]\.?/g, '')
    .replace(/changes\./g, '')
    .replace(INTERNAL_NAME_RE, (name) => INTERNAL_NAMES[name]);
}

// 程序自身的错误不是参数问题：如实告诉模型，避免它反复改参数重试。
function toFailure(err) {
  if (err instanceof TypeError || err instanceof ReferenceError) {
    log.error(`TOOL_INTERNAL_ERROR  ${formatMeta({ error: err.message, stack: err.stack })}`);
    return { success: false, error: `工具内部错误（${err.message}），不是参数问题；请换一种做法或告知用户` };
  }
  return { success: false, error: humanizeError(err?.message), ...(err?.partial ? { partial: true } : {}) };
}

// data / values / items 写成 JSON 文本时按 JSON 解析；解析不了的原样交给下游报错。
function parsed(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

// 模型有时把字段直接写在顶层而不是 data 里：没给 data 时，把其余顶层字段当作 data。
function dataOf({ data, ...rest }, reserved) {
  if (data !== undefined) return parsed(data);
  const extra = Object.fromEntries(Object.entries(rest).filter(([key]) => !reserved.includes(key)));
  return Object.keys(extra).length > 0 ? extra : undefined;
}

const kindOf = (ref) => String(ref ?? '').split(/[:@]/)[0];

// 批量调用的摘要与涉及的资源类型，如 { summary: 'entry×3 field×2', target: 'entry', targets: ['entry', 'field'] }。
function describeBatch(kinds) {
  const counts = new Map();
  for (const kind of kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  const targets = [...counts.keys()];
  return { summary: targets.map((kind) => `${kind}×${counts.get(kind)}`).join(' '), target: targets[0], targets };
}

function defineTool(name, description, properties, required, run, describe) {
  return {
    type: 'function',
    function: { name, description, parameters: { type: 'object', properties, required } },
    describe,
    recordResult: WRITE_TOOLS.has(name),
    execute: async (args = {}) => {
      try {
        return await run(args ?? {});
      } catch (err) {
        return toFailure(err);
      }
    },
  };
}

const label = (data) => data?.name ?? data?.title ?? data?.label ?? '';
const ITEMS_SCHEMA = (itemProperties, required, description) => ({
  type: 'array', description, items: { type: 'object', properties: itemProperties, required },
});

export function buildTools(workspace) {
  return [
    defineTool(
      'read',
      `读取资源或列表，返回当前内容。读一个写 ref；一次读多个写 refs（最多 20 个）。${REF_HELP}`,
      {
        ref: { type: 'string', description: '资源引用，如 world、entry:<id>、field:persona.生命、characters、doc:world' },
        refs: { type: 'array', items: { type: 'string' }, description: '一次读多个：["world", "entry:<id>", "character:<id>"]' },
        full: { type: 'boolean', description: '读 entries / characters / personas 列表时带上每一项的完整内容' },
        filter: { type: 'string', description: '读列表时只保留包含这段文字的项' },
        offset: { type: 'integer', description: '内容被截断时，从这个位置继续读' },
      },
      [],
      (args) => {
        const refs = parsed(args.refs);
        if (refs !== undefined) return workspace.readMany(refs);
        return workspace.read(args.ref, { full: args.full === true || args.full === 'true', filter: args.filter, offset: Number(args.offset) || 0 });
      },
      ({ ref, refs }) => (refs !== undefined ? { summary: describeBatch(parsed(refs).map(kindOf)).summary } : { summary: ref }),
    ),
    defineTool(
      'create',
      `新建资源，返回新资源的 ref。建一个写 kind + data；一次建多个写 items（最多 20 项，先全部校验，有一项不合格就整批不写）。`
        + `同一批里字段先于条目和卡片建立，条目条件、卡片 state 可以引用同批新建的字段。world 需要单独创建。data 可用字段：\n${DATA_FIELDS_HELP}`,
      {
        kind: { type: 'string', enum: CREATE_KINDS },
        data: { type: 'object', description: '新资源的内容' },
        items: ITEMS_SCHEMA(
          { kind: { type: 'string', enum: CREATE_KINDS }, data: { type: 'object' } },
          ['kind', 'data'],
          '一次建多个：[{ kind, data }, …]',
        ),
        world: { type: 'string', description: '建在哪个世界，省略则为当前世界' },
      },
      [],
      (args) => {
        const items = parsed(args.items);
        if (items !== undefined) return workspace.createMany(items, args.world);
        return workspace.create(args.kind, dataOf(args, ['kind', 'world', 'items']), args.world);
      },
      ({ kind, data, items }) => (items !== undefined
        ? describeBatch(parsed(items).map((item) => item.kind))
        : { summary: `${kind} ${label(parsed(data))}`.trim(), target: kind }),
    ),
    defineTool(
      'update',
      '修改资源，data 只写要改的字段（字段同 create）。改一个写 ref + data；一次改多个写 items（最多 20 项，先全部校验，有一项不合格就整批不写）。'
        + '列表字段（keywords、conditions、options、columns，以及 profile / state 里的列表）写数组是整体替换，写 { add: […], remove: […] } 是增删单项。'
        + '条目另可写 enabled（是否启用）和 order（从 1 开始的位置）。',
      {
        ref: { type: 'string' },
        data: { type: 'object', description: '要修改的字段' },
        items: ITEMS_SCHEMA({ ref: { type: 'string' }, data: { type: 'object' } }, ['ref', 'data'], '一次改多个：[{ ref, data }, …]'),
      },
      [],
      (args) => {
        const items = parsed(args.items);
        if (items !== undefined) return workspace.updateMany(items);
        return workspace.update(args.ref, dataOf(args, ['ref', 'items']));
      },
      ({ ref, items }) => (items !== undefined
        ? describeBatch(parsed(items).map((item) => kindOf(item.ref)))
        : { summary: ref, target: kindOf(ref) }),
    ),
    defineTool(
      'edit',
      '替换资源某个长文本字段里的一段原文（如 content、system_prompt、first_message；CSS 片段的正文字段也叫 content）。'
        + 'old_text 照抄原文，默认必须只出现一次；要把所有出现处都换掉加 replace_all: true。同一资源改多处写 edits，全部匹配上才写入。字段目前为空时用 update。',
      {
        ref: { type: 'string' },
        field: { type: 'string', description: '文本字段名；档案与全局设置可写点路径，如 profile.出身、writing.global_system_prompt' },
        old_text: { type: 'string' },
        new_text: { type: 'string' },
        replace_all: { type: 'boolean' },
        edits: ITEMS_SCHEMA(
          { field: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' }, replace_all: { type: 'boolean' } },
          ['field', 'old_text', 'new_text'],
          '同一资源改多处：[{ field, old_text, new_text }, …]，最多 20 处',
        ),
      },
      ['ref'],
      ({ ref, edits, ...single }) => workspace.editMany(ref, edits !== undefined ? parsed(edits) : [single]),
      ({ ref, field, edits }) => ({ summary: `${ref} ${edits !== undefined ? '' : field ?? ''}`.trim(), target: kindOf(ref) }),
    ),
    defineTool(
      'set_state',
      '设置角色卡或玩家卡的现状初始值（用户自建状态字段）。档案字段（性别、出身、穿着、核心性格等）用 create/update 的 profile 写，不走这里。values 的键写字段标签或 key，值写原生值，null 表示清空；一次设多张卡写 items。',
      {
        ref: { type: 'string', description: 'character:<id>，或 persona（当前激活玩家卡）/ persona:<id>' },
        values: { type: 'object' },
        items: ITEMS_SCHEMA({ ref: { type: 'string' }, values: { type: 'object' } }, ['ref', 'values'], '一次设多张卡：[{ ref, values }, …]'),
      },
      [],
      (args) => {
        const items = parsed(args.items);
        if (items !== undefined) return workspace.setStateMany(items.map((item) => ({ ...item, values: parsed(item?.values) })));
        return workspace.setState(args.ref, parsed(args.values));
      },
      ({ ref, items }) => (items !== undefined
        ? describeBatch(parsed(items).map((item) => kindOf(item.ref)))
        : { summary: ref, target: kindOf(ref) }),
    ),
    defineTool(
      'delete',
      '删除资源。删一个写 ref；一次删多个写 refs（最多 50 个，有一个不存在就整批不删）。删除世界、角色卡、玩家卡，或一次删多个之前，必须先得到用户明确同意。每个世界至少保留一张玩家卡。',
      {
        ref: { type: 'string' },
        refs: { type: 'array', items: { type: 'string' }, description: '一次删多个：["entry:…", "field:persona.…"]' },
      },
      [],
      (args) => {
        const refs = parsed(args.refs);
        return refs !== undefined ? workspace.removeMany(refs) : workspace.remove(args.ref);
      },
      ({ ref, refs }) => (refs !== undefined
        ? describeBatch(parsed(refs).map(kindOf))
        : { summary: ref, target: kindOf(ref) }),
    ),
    defineTool(
      'find',
      '搜索关键词：当前世界的世界简介、条目、字段、角色卡、玩家卡，以及 CSS 片段、正则规则、参考文档。每条结果列出命中的字段名，可据此直接 edit。',
      {
        query: { type: 'string' },
        kinds: { type: 'array', items: { type: 'string', enum: FIND_KINDS }, description: '只搜这些类型' },
        world: { type: 'string', description: '搜哪个世界：世界 id，或 "all" 搜全部世界；省略为当前世界' },
        limit: { type: 'integer', description: '每页条数，默认 30，最多 100' },
        offset: { type: 'integer', description: '从第几条开始，用于翻页' },
      },
      ['query'],
      ({ query, kinds, world, limit, offset }) => workspace.find(query, { kinds: parsed(kinds), world, limit: Number(limit) || undefined, offset: Number(offset) || 0 }),
      ({ query }) => ({ summary: query }),
    ),
  ];
}

export function buildWrappedTools(workspace, emitFn, opts = {}) {
  return buildTools(workspace).map((tool) => wrapToolEvents(tool, emitFn, opts));
}
