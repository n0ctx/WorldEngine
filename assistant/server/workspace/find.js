// 关键词搜索：条目、字段、角色卡、玩家卡、世界简介，以及全局的 CSS 片段、正则规则、参考文档。只读。

import { getAllWorldEntries } from '../../../backend/db/queries/prompt-entries.js';
import { getCharactersByWorldId } from '../../../backend/db/queries/characters.js';
import { getPersonasByWorldId } from '../../../backend/db/queries/personas.js';
import { listCustomCssSnippets } from '../../../backend/db/queries/custom-css-snippets.js';
import { listRegexRules } from '../../../backend/db/queries/regex-rules.js';
import { getAllWorlds } from '../../../backend/db/queries/worlds.js';
import { getWorldById } from '../../../backend/services/worlds.js';

import { fail } from './common.js';
import { FIELD_TARGETS } from './refs.js';
import { listFieldRows, fieldRef } from './fields.js';
import { searchDocs } from './docs.js';
import { FIND_DEFAULT_LIMIT, FIND_MAX_LIMIT } from './limits.js';

export const FIND_KINDS = ['world', 'entry', 'field', 'character', 'persona', 'css', 'regex', 'doc'];
const SNIPPET_RADIUS = 40;
const MAX_SNIPPETS = 2;

function countIn(haystack, needle) {
  let count = 0;
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + needle.length)) count += 1;
  return count;
}

function snippetAround(text, lowered, needle) {
  const idx = lowered.indexOf(needle);
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = idx + needle.length + SNIPPET_RADIUS;
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}`;
}

// 档案值按文本搜索，不让内部字段名造成误命中。
function profileText(json) {
  try {
    return Object.values(JSON.parse(json || '{}')).flat().join(' ');
  } catch {
    return '';
  }
}

// parts: { 字段名: 文本 }。命中时给出每个命中字段的出现次数，以及最多两段上下文。
function hitLine(ref, label, parts, needle) {
  const matched = [];
  const snippets = [];
  for (const [name, value] of Object.entries(parts)) {
    const text = Array.isArray(value) ? value.join(' ') : String(value ?? '');
    const lowered = text.toLowerCase();
    const count = countIn(lowered, needle);
    if (count === 0) continue;
    matched.push(count > 1 ? `${name}×${count}` : name);
    if (snippets.length < MAX_SNIPPETS) snippets.push(snippetAround(text, lowered, needle));
  }
  return matched.length > 0 ? `${ref} ${label} [${matched.join(', ')}]：${snippets.join(' ／ ')}` : null;
}

function scanWorld(world, needle, wants, tagWorld) {
  const tag = tagWorld ? `@${world.id}` : '';
  const hits = [];
  const add = (line) => { if (line) hits.push(line); };
  if (wants('world')) add(hitLine(`world:${world.id}`, world.name, { name: world.name, description: world.description }, needle));
  if (wants('entry')) {
    for (const e of getAllWorldEntries(world.id)) {
      add(hitLine(`entry:${e.id}`, e.title, { title: e.title, description: e.description, keywords: e.keywords ?? [], content: e.content }, needle));
    }
  }
  if (wants('field')) {
    for (const target of FIELD_TARGETS) {
      for (const f of listFieldRows(world.id, target)) {
        add(hitLine(`${fieldRef(target, f.field_key)}${tag}`, f.label, {
          label: f.label, key: f.field_key, description: f.description, options: f.enum_options ?? [], update_instruction: f.update_instruction,
        }, needle));
      }
    }
  }
  if (wants('character')) {
    for (const c of getCharactersByWorldId(world.id)) {
      add(hitLine(`character:${c.id}`, c.name, {
        name: c.name, description: c.description, system_prompt: c.system_prompt, post_prompt: c.post_prompt,
        first_message: c.first_message, profile: profileText(c.profile_defaults_json),
      }, needle));
    }
  }
  if (wants('persona')) {
    for (const p of getPersonasByWorldId(world.id)) {
      add(hitLine(`persona:${p.id}`, p.name || '(未命名)', {
        name: p.name, description: p.description, system_prompt: p.system_prompt, profile: profileText(p.profile_defaults_json),
      }, needle));
    }
  }
  return tagWorld ? hits.map((line) => `${line}（世界：${world.name}）`) : hits;
}

function scanGlobal(needle, wants) {
  const hits = [];
  const add = (line) => { if (line) hits.push(line); };
  if (wants('css')) for (const s of listCustomCssSnippets()) add(hitLine(`css:${s.id}`, s.name, { name: s.name, content: s.content }, needle));
  if (wants('regex')) {
    for (const r of listRegexRules()) add(hitLine(`regex:${r.id}`, r.name, { name: r.name, pattern: r.pattern, replacement: r.replacement }, needle));
  }
  if (wants('doc')) for (const d of searchDocs(needle)) hits.push(`${d.ref}：${d.text}`);
  return hits;
}

function targetWorlds(session, world) {
  if (world === 'all') return getAllWorlds();
  const worldId = world ? String(world).replace(/^world:/, '') : session.worldId;
  if (!worldId) return [];
  const found = getWorldById(worldId);
  if (!found) fail(`世界 ${worldId} 不存在；read("worlds") 查看全部世界`);
  return [found];
}

function wantsOf(kinds) {
  if (kinds == null) return () => true;
  const list = Array.isArray(kinds) ? kinds : [kinds];
  const unknown = list.filter((kind) => !FIND_KINDS.includes(kind));
  if (unknown.length > 0) fail(`kinds 只能包含 ${FIND_KINDS.join(' / ')}，收到 ${unknown.join(', ')}`);
  return (kind) => list.includes(kind);
}

function pageSize(limit) {
  const size = Number(limit);
  return Number.isInteger(size) && size > 0 ? Math.min(size, FIND_MAX_LIMIT) : FIND_DEFAULT_LIMIT;
}

/** options: { kinds, world, limit, offset }。world 省略为当前世界，"all" 为全部世界。 */
export function findWorkspaceResources(session, query, options = {}) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (!needle) fail('query 不能为空');
  const wants = wantsOf(options.kinds);
  const worlds = targetWorlds(session, options.world);
  const hits = [
    ...worlds.flatMap((world) => scanWorld(world, needle, wants, options.world === 'all')),
    ...scanGlobal(needle, wants),
  ];
  if (hits.length === 0) {
    return `没有找到包含 "${query}" 的内容${worlds.length > 0 ? '' : '（当前未选中世界，只搜索了全局资源与文档）'}`;
  }
  const size = pageSize(options.limit);
  const start = Number.isInteger(options.offset) && options.offset > 0 ? options.offset : 0;
  const shown = hits.slice(start, start + size);
  if (shown.length === hits.length) return shown.join('\n');
  const end = start + shown.length;
  const next = end < hits.length ? `；下一页加 offset: ${end}，或用 kinds 缩小范围` : '';
  return [...shown, `（共 ${hits.length} 条，显示 ${Math.min(start + 1, hits.length)}-${end}${next}）`].join('\n');
}
