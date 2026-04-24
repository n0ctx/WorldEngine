import crypto from 'node:crypto';
import db from '../index.js';

/**
 * 查询指定条目的所有状态条件，按插入顺序返回
 * @param {string} entryId
 * @returns {Array<{ id, entry_id, target_field, operator, value }>}
 */
export function listConditionsByEntry(entryId) {
  return db.prepare('SELECT * FROM entry_conditions WHERE entry_id = ? ORDER BY rowid ASC').all(entryId);
}

/**
 * 事务内替换条目的所有条件（先清空，再批量插入）
 * @param {string} entryId
 * @param {Array<{ target_field: string, operator: string, value: string }>} conditions
 */
export function replaceEntryConditions(entryId, conditions) {
  const del = db.prepare('DELETE FROM entry_conditions WHERE entry_id = ?');
  const ins = db.prepare(
    'INSERT INTO entry_conditions (id, entry_id, target_field, operator, value) VALUES (?, ?, ?, ?, ?)',
  );
  db.transaction(() => {
    del.run(entryId);
    for (const c of conditions) {
      ins.run(crypto.randomUUID(), entryId, c.target_field, c.operator, c.value);
    }
  })();
}
