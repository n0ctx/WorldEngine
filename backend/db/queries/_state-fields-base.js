/**
 * _state-fields-base.js — 状态字段三件套共用的行解析辅助函数
 *
 * 被以下模块引用：
 *   world-state-fields.js
 *   character-state-fields.js
 *   persona-state-fields.js
 *
 * enum_options 在 queries 层自动 JSON parse/stringify；
 * default_value 保持原始 JSON 字符串，调用方按 type 自行解析。
 */

export function parseRow(row) {
  if (!row) return row;
  return {
    ...row,
    enum_options: row.enum_options ? JSON.parse(row.enum_options) : null,
  };
}

export const parseAll = (rows) => rows.map(parseRow);
