/**
 * _update-helpers.js — 按 id 部分更新 / 批量排序的通用写法
 *
 * 被 characters / worlds / personas / custom-css-snippets / regex-rules / _state-fields-base 引用。
 */

import db from '../index.js';

/**
 * 只写 patch 里出现的白名单列并刷新 updated_at；patch 不含白名单列时不写库。返回更新后的行。
 * @param {string} table
 * @param {string} id
 * @param {object} patch
 * @param {string[]} allowedColumns
 */
export function updateRowFields(table, id, patch, allowedColumns) {
  const sets = [];
  const values = [];
  for (const field of allowedColumns) {
    if (field in patch) {
      sets.push(`${field} = ?`);
      values.push(patch[field]);
    }
  }
  if (sets.length > 0) {
    sets.push('updated_at = ?');
    values.push(Date.now(), id);
    db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
}

/**
 * 在一个事务里批量写入 sort_order 并刷新 updated_at
 * @param {string} table
 * @param {Array<{ id: string, sort_order: number }>} items
 */
export function reorderRows(table, items) {
  const stmt = db.prepare(`UPDATE ${table} SET sort_order = ?, updated_at = ? WHERE id = ?`);
  const now = Date.now();
  db.transaction(() => {
    for (const item of items) {
      stmt.run(item.sort_order, now, item.id);
    }
  })();
}
