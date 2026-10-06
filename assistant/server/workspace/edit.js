// 局部替换：把资源某个文本字段里的一段原文换成新文本，一次调用可对同一资源做多处替换。

import { fail } from './common.js';
import { parseRef } from './refs.js';
import { editableFieldName, readEditableText } from './editable-text.js';
import { updateWorkspaceResources } from './write.js';
import { replaceText } from './text-match.js';
import { MAX_EDITS } from './limits.js';

function setPath(target, dotted, value) {
  const keys = dotted.split('.');
  let node = target;
  for (const key of keys.slice(0, -1)) node = (node[key] ??= {});
  node[keys.at(-1)] = value;
  return target;
}

function openField(ref, session, field) {
  const original = readEditableText(ref, session, field);
  return { crlf: original.includes('\r\n'), text: original.replace(/\r\n/g, '\n') };
}

function normalizeEdit(raw, kind, index, total) {
  const where = total > 1 ? `第 ${index + 1} 处：` : '';
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(`${where}每处替换需要 { field, old_text, new_text }`);
  if (typeof raw.field !== 'string' || !raw.field.trim()) fail(`${where}缺少 field（要修改的文本字段名，如 content / system_prompt）`);
  if (typeof raw.old_text !== 'string' || !raw.old_text) fail(`${where}old_text 不能为空`);
  return {
    where,
    field: editableFieldName(kind, raw.field),
    oldText: raw.old_text.replace(/\r\n/g, '\n'),
    newText: String(raw.new_text ?? '').replace(/\r\n/g, '\n'),
    replaceAll: raw.replace_all === true || raw.replace_all === 'true',
  };
}

function applyEdit(text, edit, refText) {
  const result = replaceText(text, edit.oldText, edit.newText, edit.replaceAll);
  if (result.count === 0) {
    fail(`${edit.where}${edit.field} 中找不到 old_text${result.hint ? `：${result.hint}` : ''}；先 read("${refText}") 核对原文`);
  }
  if (result.text === undefined) {
    fail(`${edit.where}old_text 在 ${edit.field} 中出现 ${result.count} 次；多带一些上下文使其唯一，或加 replace_all: true 全部替换`);
  }
  return result;
}

/** edits: [{ field, old_text, new_text, replace_all? }]，按顺序套用，全部匹配上才写一次。 */
export async function editWorkspaceResource(session, rawRef, edits) {
  const ref = parseRef(rawRef);
  if (ref.list || ref.kind === 'doc') fail('edit 需要可修改的单个资源 ref');
  if (!Array.isArray(edits) || edits.length === 0) fail('edits 必须是非空数组');
  if (edits.length > MAX_EDITS) fail(`一次最多 ${MAX_EDITS} 处替换，收到 ${edits.length} 处；请拆成多次调用（未写入任何内容）`);

  // 换行统一成 LF 再匹配；原文用 CRLF 的字段写回时恢复，保持原有风格。
  const fields = new Map();
  const notes = [];
  let replaced = 0;
  const normalized = edits.map((raw, index) => normalizeEdit(raw, ref.kind, index, edits.length));
  for (const edit of normalized) {
    if (!fields.has(edit.field)) fields.set(edit.field, openField(ref, session, edit.field));
    const state = fields.get(edit.field);
    const result = applyEdit(state.text, edit, ref.text);
    state.text = result.text;
    replaced += result.count;
    if (result.note) notes.push(`${edit.where || `${edit.field}：`}${result.note}才匹配上`);
  }

  const data = {};
  for (const [field, state] of fields) setPath(data, field, state.crlf ? state.text.replace(/\n/g, '\r\n') : state.text);
  const receipt = await updateWorkspaceResources(session, [{ ref: rawRef, data }]);
  const detail = [replaced > 1 ? `替换 ${replaced} 处` : null, ...notes].filter(Boolean).join('；');
  return detail ? `${receipt}（${detail}）` : receipt;
}
