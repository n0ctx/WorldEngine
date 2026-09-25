/**
 * _state-fields-base.js — 状态字段三件套共用的行解析、部分更新与排序
 *
 * 被以下模块引用：
 *   world-state-fields.js
 *   character-state-fields.js
 *   persona-state-fields.js
 *
 * enum_options 在 queries 层自动 JSON parse/stringify；
 * default_value 保持原始 JSON 字符串，调用方按 type 自行解析。
 */

import db from '../index.js';
import { updateRowFields } from './_update-helpers.js';

const EDITABLE_COLUMNS = [
  'field_key', 'label', 'type', 'description', 'default_value',
  'update_mode', 'enum_options',
  'min_value', 'max_value', 'allow_empty', 'update_instruction', 'prefix', 'unit', 'table_columns', 'sort_order',
];
const JSON_COLUMNS = new Set(['enum_options', 'table_columns']);

export function parseRow(row) {
  if (!row) return row;
  return {
    ...row,
    enum_options: row.enum_options ? JSON.parse(row.enum_options) : null,
    table_columns: row.table_columns ? JSON.parse(row.table_columns) : null,
  };
}

export const parseAll = (rows) => rows.map(parseRow);

/**
 * 部分更新字段定义：只写 patch 里出现的可编辑列，没有可写列时不更新；返回更新后的行（已解析）。
 * @param {Record<string, (value: unknown) => unknown>} [extraColumns]  该表额外可编辑的列及其取值转换
 */
export function updateStateFieldRow(table, id, patch, extraColumns = {}) {
  const columns = [...EDITABLE_COLUMNS, ...Object.keys(extraColumns)];
  const encoded = {};
  for (const field of columns) {
    if (!(field in patch)) continue;
    if (JSON_COLUMNS.has(field)) {
      encoded[field] = patch[field] != null ? JSON.stringify(patch[field]) : null;
    } else if (extraColumns[field]) {
      encoded[field] = extraColumns[field](patch[field]);
    } else {
      encoded[field] = patch[field];
    }
  }
  return parseRow(updateRowFields(table, id, encoded, columns));
}

/**
 * 批量重排序：orderedIds[0] 的 sort_order = 0，依次递增
 */
export function reorderStateFieldRows(table, worldId, orderedIds) {
  const update = db.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ? AND world_id = ?`);
  const tx = db.transaction((ids) => {
    ids.forEach((id, i) => update.run(i, id, worldId));
  });
  tx(orderedIds);
}
