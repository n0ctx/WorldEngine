// edit 要替换的文本从哪里取：各类资源的文本字段，以及档案、状态、全局设置的点路径。

import { getWorldById } from '../../../backend/services/worlds.js';

import { fail } from './common.js';
import { worldIdOf } from './refs.js';
import { loadEntry } from './entries.js';
import { findField } from './fields.js';
import { loadCharacter, loadPersona } from './cards.js';
import { loadCss, loadRegex } from './style.js';
import { readItem } from './read.js';

// 各类资源可直接替换的文本字段；值取自库里的原始记录，不经过读取视图的占位与省略。
const TEXT_FIELDS = {
  world: ['name', 'description'],
  entry: ['title', 'description', 'content'],
  field: ['label', 'description', 'update_instruction', 'prefix'],
  character: ['name', 'description', 'system_prompt', 'post_prompt', 'first_message'],
  persona: ['name', 'description', 'system_prompt'],
  css: ['name', 'content'],
  regex: ['name', 'pattern', 'replacement'],
};
// 模型常把 CSS 片段的正文叫作 css。
const FIELD_ALIASES = { css: { css: 'content' } };

/** 字段名归一：去空白、套用别名 */
export function editableFieldName(kind, field) {
  const name = String(field).trim();
  return FIELD_ALIASES[kind]?.[name] ?? name;
}

function loadRow(ref, session) {
  switch (ref.kind) {
    case 'world': return getWorldById(ref.id ?? worldIdOf(ref, session));
    case 'entry': return loadEntry(ref.id);
    case 'field': return findField(worldIdOf(ref, session), ref.target, ref.key);
    case 'character': return loadCharacter(ref.id);
    case 'persona': return loadPersona(ref, ref.worldId ?? session.worldId);
    case 'css': return loadCss(ref.id);
    case 'regex': return loadRegex(ref.id);
    default: return null;
  }
}

const getPath = (source, dotted) => dotted.split('.').reduce((node, key) => (node == null ? undefined : node[key]), source);

// 点路径（profile.性别、state.心情、全局设置的 writing.xxx）从读取视图取值；其余字段从原始记录取值。
export function readEditableText(ref, session, field) {
  const direct = TEXT_FIELDS[ref.kind];
  if (!direct || field.includes('.')) {
    const value = getPath(readItem(ref, session), field);
    if (typeof value !== 'string') fail(`${ref.text} 没有文本字段 ${field}；先 read 查看可用字段`);
    return value;
  }
  if (!direct.includes(field)) fail(`${ref.text} 没有文本字段 ${field}；可替换的字段：${direct.join('、')}`);
  const value = loadRow(ref, session)?.[field];
  if (typeof value !== 'string' || !value) fail(`${ref.text} 的 ${field} 目前为空，请用 update 直接写入`);
  return value;
}
