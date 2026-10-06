// 读取资源与列表。只读：不创建、不修改任何内容。

import { fail, toJson } from './common.js';
import { parseRef, worldIdOf } from './refs.js';
import { viewWorld, listWorlds } from './world.js';
import { loadEntry, viewEntry, listEntries } from './entries.js';
import { findField, viewField, listFields } from './fields.js';
import {
  loadCharacter, loadPersona, viewCharacter, viewPersona, listCharacters, listPersonaRefs,
} from './cards.js';
import { loadCss, viewCss, listCss, loadRegex, viewRegex, listRegex } from './style.js';
import { viewConfig } from './config.js';
import { listDocs, readDoc } from './docs.js';
import { MAX_READ_CHARS, MAX_READ_REFS } from './limits.js';

function readList(ref, session) {
  switch (ref.kind) {
    case 'worlds': return listWorlds();
    case 'entries': return listEntries(worldIdOf(ref, session));
    case 'fields': return listFields(worldIdOf(ref, session));
    case 'characters': return listCharacters(worldIdOf(ref, session));
    case 'personas': return listPersonaRefs(worldIdOf(ref, session));
    case 'css': return listCss();
    case 'regex': return listRegex();
    case 'docs': return listDocs();
    default: return fail(`未知列表 ${ref.kind}`);
  }
}

export function readItem(ref, session) {
  switch (ref.kind) {
    case 'world': return viewWorld(ref.id ?? worldIdOf(ref, session));
    case 'entry': return viewEntry(loadEntry(ref.id));
    case 'field': return viewField(ref.target, findField(worldIdOf(ref, session), ref.target, ref.key));
    case 'character': return viewCharacter(loadCharacter(ref.id));
    case 'persona': return viewPersona(loadPersona(ref, ref.worldId ?? session.worldId));
    case 'css': return viewCss(loadCss(ref.id));
    case 'regex': return viewRegex(loadRegex(ref.id));
    case 'config': return viewConfig();
    default: return fail(`未知资源 ${ref.kind}`);
  }
}

const itemRefOf = (row) => String(typeof row === 'string' ? row : row.ref).split(' ')[0];

// 目录行换成完整内容：条目、角色卡、玩家卡的列表支持；其余列表的目录行本身就是全部内容。
function expandList(ref, rows, session) {
  if (!['entries', 'characters', 'personas'].includes(ref.kind)) return rows;
  return rows.map((row) => readItem(parseRef(itemRefOf(row)), session));
}

function keepMatching(list, needle) {
  const matches = (row) => JSON.stringify(row).toLowerCase().includes(needle);
  if (Array.isArray(list)) return list.filter(matches);
  return Object.fromEntries(Object.entries(list).map(([group, rows]) => [group, rows.filter(matches)]));
}

function readOne(session, rawRef, { full = false, filter } = {}) {
  const ref = parseRef(rawRef);
  if (ref.kind === 'doc') return readDoc(ref.id);
  if (!ref.list) return toJson(readItem(ref, session));
  let list = readList(ref, session);
  if (full) list = expandList(ref, list, session);
  const needle = String(filter ?? '').trim().toLowerCase();
  return toJson(needle ? keepMatching(list, needle) : list);
}

// 超出上限时截断，并说明怎样读剩下的部分。
function window(text, rawRef, offset) {
  const start = Number.isInteger(offset) && offset > 0 ? offset : 0;
  if (start === 0 && text.length <= MAX_READ_CHARS) return text;
  if (start >= text.length) fail(`offset ${start} 超出内容长度 ${text.length}`);
  const end = Math.min(text.length, start + MAX_READ_CHARS);
  const more = end < text.length ? `；继续读 read({ ref: "${rawRef}", offset: ${end} })` : '；已到末尾';
  return `${text.slice(start, end)}\n（已截断：共 ${text.length} 字符，本次 ${start}-${end}${more}）`;
}

/** 读一个资源或列表。options: { full, filter, offset } */
export function readWorkspace(session, rawRef, options = {}) {
  return window(readOne(session, rawRef, options), rawRef, options.offset);
}

/** 一次读多个：按 `=== ref ===` 分段；单个读不到的写在它自己的段里，全部读不到才算失败。 */
export function readWorkspaceMany(session, refs) {
  if (!Array.isArray(refs) || refs.length === 0) fail('refs 必须是非空数组，如 ["world", "entry:<id>"]');
  if (refs.length > MAX_READ_REFS) fail(`一次最多读 ${MAX_READ_REFS} 个，收到 ${refs.length} 个；请分批 read`);
  const sections = [];
  const unread = [];
  let used = 0;
  let failures = 0;
  for (const rawRef of refs) {
    let body;
    try {
      body = readOne(session, rawRef);
    } catch (err) {
      failures += 1;
      body = `读取失败：${err.message}`;
    }
    if (used > 0 && used + body.length > MAX_READ_CHARS) {
      unread.push(rawRef);
      continue;
    }
    used += body.length;
    sections.push(`=== ${rawRef} ===\n${window(body, rawRef, 0)}`);
  }
  if (failures === refs.length) fail(sections.map((s) => s.replace(/^=== (.+) ===\n读取失败：/, '$1：')).join('；'));
  if (unread.length > 0) {
    sections.push(`（输出已达上限 ${MAX_READ_CHARS} 字符，以下 ${unread.length} 个未读取：${unread.join('、')}；请分批 read）`);
  }
  return sections.join('\n\n');
}
