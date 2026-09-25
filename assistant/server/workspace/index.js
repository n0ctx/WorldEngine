// 写卡助手工作区：把 read / create / update / edit / set_state / delete / find 分发到各类资源。
// 所有写入最终经 normalizeProposal → applyProposal 落库；这里只负责定位资源与补齐参数。

import { getAllWorldEntries } from '../../../backend/db/queries/prompt-entries.js';
import { getCharactersByWorldId } from '../../../backend/db/queries/characters.js';
import { listPersonas } from '../../../backend/services/personas.js';
import { listCustomCssSnippets } from '../../../backend/db/queries/custom-css-snippets.js';
import { listRegexRules } from '../../../backend/db/queries/regex-rules.js';

import { fail, toJson } from './common.js';
import { parseRef, worldIdOf, FIELD_TARGETS } from './refs.js';
import { viewWorld, listWorlds, createWorld, updateWorld, removeWorld } from './world.js';
import { loadEntry, viewEntry, listEntries, createEntry, updateEntry, removeEntry } from './entries.js';
import {
  findField, viewField, listFields, listFieldRows, fieldRef, createField, updateField, removeField,
} from './fields.js';
import {
  loadCharacter, loadPersona, viewCharacter, viewPersona, listCharacters, listPersonaRefs,
  createCharacter, updateCharacter, removeCharacter, createPersona, updatePersona,
} from './cards.js';
import {
  loadCss, viewCss, listCss, createCss, updateCss, removeCss,
  loadRegex, viewRegex, listRegex, createRegex, updateRegex, removeRegex,
  loadTheme, viewTheme, listThemeRefs, createTheme, updateTheme, removeTheme,
} from './style.js';
import { viewConfig, updateConfig } from './config.js';
import { listDocs, readDoc, searchDocs } from './docs.js';

export const CREATE_KINDS = ['world', 'entry', 'field', 'character', 'persona', 'css', 'regex', 'theme'];
const MAX_FIND_HITS = 30;

function readList(ref, session) {
  switch (ref.kind) {
    case 'worlds': return listWorlds();
    case 'entries': return listEntries(worldIdOf(ref, session));
    case 'fields': return listFields(worldIdOf(ref, session));
    case 'characters': return listCharacters(worldIdOf(ref, session));
    case 'personas': return listPersonaRefs(worldIdOf(ref, session));
    case 'css': return listCss();
    case 'regex': return listRegex();
    case 'themes': return listThemeRefs();
    case 'docs': return listDocs();
    default: return fail(`未知列表 ${ref.kind}`);
  }
}

function readItem(ref, session) {
  switch (ref.kind) {
    case 'world': return viewWorld(ref.id ?? worldIdOf(ref, session));
    case 'entry': return viewEntry(loadEntry(ref.id));
    case 'field': return viewField(ref.target, findField(worldIdOf(ref, session), ref.target, ref.key));
    case 'character': return viewCharacter(loadCharacter(ref.id));
    case 'persona': return viewPersona(loadPersona(ref, ref.worldId ?? session.worldId));
    case 'css': return viewCss(loadCss(ref.id));
    case 'regex': return viewRegex(loadRegex(ref.id));
    case 'theme': return viewTheme(loadTheme(ref.id));
    case 'config': return viewConfig();
    default: return fail(`未知资源 ${ref.kind}`);
  }
}

function setPath(target, dotted, value) {
  const keys = dotted.split('.');
  let node = target;
  for (const key of keys.slice(0, -1)) node = (node[key] ??= {});
  node[keys.at(-1)] = value;
  return target;
}

function getPath(source, dotted) {
  return dotted.split('.').reduce((node, key) => (node == null ? undefined : node[key]), source);
}

function countOccurrences(text, needle) {
  let count = 0;
  for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + needle.length)) count += 1;
  return count;
}

function snippetAround(text, needle, radius = 40) {
  const idx = text.toLowerCase().indexOf(needle);
  if (idx < 0) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, idx + needle.length + radius).replace(/\s+/g, ' ')}…`;
}

function readWorkspace(session, rawRef) {
  const ref = parseRef(rawRef);
  if (ref.kind === 'doc') return readDoc(ref.id);
  const result = ref.list ? readList(ref, session) : readItem(ref, session);
  return toJson(result);
}

// world 可选，指定资源建在哪个世界；省略时用当前世界。
async function createWorkspaceResource(session, kind, data, world = null) {
  const worldRef = world ? { worldId: String(world).replace(/^world:/, '') } : null;
  const targetWorld = () => worldIdOf(worldRef, session);
  switch (kind) {
    case 'world': return createWorld(session, data);
    case 'entry': return createEntry(targetWorld(), data);
    case 'field': return createField(targetWorld(), data);
    case 'character': return createCharacter(targetWorld(), data);
    case 'persona': return createPersona(targetWorld(), data);
    case 'css': return createCss(data);
    case 'regex': return createRegex(data, worldRef?.worldId ?? session.worldId);
    case 'theme': return createTheme(data);
    default: return fail(`kind 只能是 ${CREATE_KINDS.join(' / ')}`);
  }
}

async function updateWorkspaceResource(session, rawRef, data) {
  const ref = parseRef(rawRef);
  if (ref.list) fail('update 需要单个资源的 ref，不能是列表');
  switch (ref.kind) {
    case 'world': return updateWorld(ref.id ?? worldIdOf(ref, session), data);
    case 'entry': return updateEntry(ref.id, data);
    case 'field': return updateField(worldIdOf(ref, session), ref, data);
    case 'character': return updateCharacter(ref.id, data);
    case 'persona': return updatePersona(loadPersona(ref, ref.worldId ?? session.worldId), data);
    case 'css': return updateCss(ref.id, data);
    case 'regex': return updateRegex(ref.id, data, session.worldId);
    case 'theme': return updateTheme(ref.id, data);
    case 'config': return updateConfig(data);
    default: return fail(`${ref.kind} 不支持修改`);
  }
}

// pi 式局部替换：oldText 必须在该字段中恰好出现一次。
async function editWorkspaceResource(session, rawRef, field, oldText, newText) {
  const ref = parseRef(rawRef);
  if (ref.list || ref.kind === 'doc') fail('edit 需要可修改的单个资源 ref');
  if (typeof field !== 'string' || !field.trim()) fail('缺少 field（要修改的文本字段名，如 content / system_prompt / css）');
  if (typeof oldText !== 'string' || !oldText) fail('old_text 不能为空');
  const current = getPath(readItem(ref, session), field);
  if (typeof current !== 'string') fail(`${ref.text} 没有文本字段 ${field}；先 read 查看可用字段`);
  const count = countOccurrences(current, oldText);
  if (count === 0) fail(`${field} 中找不到 old_text；先 read("${ref.text}") 核对原文（需逐字一致）`);
  if (count > 1) fail(`old_text 在 ${field} 中出现 ${count} 次，请多带一些上下文使其唯一`);
  const next = current.replace(oldText, () => String(newText ?? ''));
  return updateWorkspaceResource(session, rawRef, setPath({}, field, next));
}

async function setWorkspaceState(session, rawRef, values) {
  const ref = parseRef(rawRef);
  if (ref.kind === 'character') return updateCharacter(ref.id, { state: values });
  if (ref.kind === 'persona') return updatePersona(loadPersona(ref, ref.worldId ?? session.worldId), { state: values });
  return fail('set_state 只用于 character:<id> 或 persona[:id]；世界层字段的初始值请用 update("field:world.<字段>", { default })');
}

async function removeWorkspaceResource(session, rawRef) {
  const ref = parseRef(rawRef);
  if (ref.list) fail('delete 需要单个资源的 ref，不能是列表');
  switch (ref.kind) {
    case 'world': return removeWorld(session, ref.id ?? worldIdOf(ref, session));
    case 'entry': return removeEntry(ref.id);
    case 'field': return removeField(worldIdOf(ref, session), ref);
    case 'character': return removeCharacter(ref.id);
    case 'css': return removeCss(ref.id);
    case 'regex': return removeRegex(ref.id);
    case 'theme': return removeTheme(ref.id);
    default: return fail(`${ref.kind} 不支持删除`);
  }
}

function findWorkspaceResources(session, query) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) fail('query 不能为空');
  const hits = [];
  const scan = (ref, label, texts) => {
    const text = texts.filter(Boolean).join('\n');
    if (text.toLowerCase().includes(needle)) hits.push(`${ref} ${label}：${snippetAround(text, needle)}`);
  };
  const worldId = session.worldId;
  if (worldId) {
    for (const e of getAllWorldEntries(worldId)) {
      scan(`entry:${e.id}`, e.title, [e.title, e.description, (e.keywords ?? []).join(' '), e.content]);
    }
    for (const target of FIELD_TARGETS) {
      for (const f of listFieldRows(worldId, target)) {
        scan(fieldRef(target, f.field_key), f.label, [f.label, f.field_key, f.description, f.update_instruction]);
      }
    }
    for (const c of getCharactersByWorldId(worldId)) {
      scan(`character:${c.id}`, c.name, [c.name, c.description, c.system_prompt, c.post_prompt, c.first_message]);
    }
    for (const p of listPersonas(worldId)) scan(`persona:${p.id}`, p.name, [p.name, p.description, p.system_prompt]);
  }
  for (const s of listCustomCssSnippets()) scan(`css:${s.id}`, s.name, [s.name, s.content]);
  for (const r of listRegexRules()) scan(`regex:${r.id}`, r.name, [r.name, r.pattern, r.replacement]);
  for (const d of searchDocs(needle)) hits.push(`${d.ref}：${d.text}`);
  if (hits.length === 0) return `没有找到包含 "${query}" 的内容${worldId ? '' : '（当前未选中世界，只搜索了全局资源与文档）'}`;
  const shown = hits.slice(0, MAX_FIND_HITS);
  return [...shown, ...(hits.length > shown.length ? [`…共 ${hits.length} 条，请缩小关键词`] : [])].join('\n');
}

export function createWorkspace(context = {}) {
  const session = {
    worldId: context.worldId ?? null,
    characterId: context.characterId ?? null,
  };
  return {
    session,
    read: (rawRef) => readWorkspace(session, rawRef),
    create: (kind, data, world) => createWorkspaceResource(session, kind, data, world),
    update: (rawRef, data) => updateWorkspaceResource(session, rawRef, data),
    edit: (rawRef, field, oldText, newText) => editWorkspaceResource(session, rawRef, field, oldText, newText),
    setState: (rawRef, values) => setWorkspaceState(session, rawRef, values),
    remove: (rawRef) => removeWorkspaceResource(session, rawRef),
    find: (query) => findWorkspaceResources(session, query),
  };
}
