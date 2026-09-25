// 资源引用（ref）解析。
//
// 单个资源：world[:id] / entry:<id> / field:<world|persona|character>.<key或标签> /
//           character:<id> / persona[:id] / css:<id> / regex:<id> / theme:<id> / config / doc:<name>
// 列表：worlds / entries / fields / characters / personas / css / regex / themes / docs
// 与世界相关的 ref 可加 @<worldId> 指定世界，省略时用当前世界。

import { fail } from './common.js';

const LIST_KINDS = ['worlds', 'entries', 'fields', 'characters', 'personas', 'css', 'regex', 'themes', 'docs'];
const ITEM_KINDS = ['world', 'entry', 'field', 'character', 'persona', 'css', 'regex', 'theme', 'config', 'doc'];
const ID_OPTIONAL = new Set(['world', 'persona', 'config']);
const LIST_OF = {
  entry: 'entries', field: 'fields', character: 'characters', css: 'css', regex: 'regex', theme: 'themes', doc: 'docs',
};
export const FIELD_TARGETS = ['world', 'persona', 'character'];

export const REF_HELP = '可用 ref：world、entry:<id>、field:persona.<字段>、character:<id>、persona、css:<id>、regex:<id>、theme:<id>、config、doc:<名称>；'
  + `列表：${LIST_KINDS.join(' / ')}`;

export function parseRef(raw) {
  const text = String(raw ?? '').trim();
  if (!text) fail(`ref 不能为空。${REF_HELP}`);
  let body = text;
  let worldId = null;
  const at = text.lastIndexOf('@');
  if (at > 0) {
    body = text.slice(0, at);
    worldId = text.slice(at + 1).trim() || null;
  }
  if (LIST_KINDS.includes(body)) return { text, list: true, kind: body, worldId };

  const colon = body.indexOf(':');
  const kind = colon < 0 ? body : body.slice(0, colon);
  const id = colon < 0 ? null : body.slice(colon + 1).trim() || null;
  if (!ITEM_KINDS.includes(kind)) fail(`无法识别的 ref "${text}"。${REF_HELP}`);
  if (!id && !ID_OPTIONAL.has(kind)) {
    fail(`${kind} 需要写成 ${kind}:<id>；可先 read("${LIST_OF[kind]}") 查看`);
  }
  if (kind !== 'field') return { text, list: false, kind, id, worldId };

  const dot = id.indexOf('.');
  const target = dot < 0 ? '' : id.slice(0, dot);
  const key = dot < 0 ? '' : id.slice(dot + 1).trim();
  if (!FIELD_TARGETS.includes(target) || !key) {
    fail(`字段 ref 写法：field:<world|persona|character>.<字段 key 或标签>，收到 "${text}"`);
  }
  return { text, list: false, kind, id, worldId, target, key };
}

export function worldIdOf(ref, session) {
  const worldId = ref?.worldId ?? session.worldId;
  if (!worldId) fail('当前没有选中世界：先 create("world", …)，或在 ref 后加 @<worldId>');
  return worldId;
}
