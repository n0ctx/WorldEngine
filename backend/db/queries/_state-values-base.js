/**
 * _state-values-base.js — 状态值三件套共用的 upsert
 *
 * 被以下模块引用：
 *   world-state-values.js
 *   character-state-values.js
 *   persona-state-values.js
 */

import crypto from 'node:crypto';
import db from '../index.js';

/**
 * 按 (ownerColumn, field_key) upsert 一条状态值，返回写入后的整行。
 * 行不存在且 patch.skipCreate 为真时返回 null；patch 不含任何可写字段时原样返回现有行。
 *
 * @param {string} table
 * @param {string} ownerColumn
 * @param {string} ownerId
 * @param {string} fieldKey
 * @param {{ defaultValueJson?: string|null, runtimeValueJson?: string|null, touchUpdatedAt?: boolean, skipCreate?: boolean }} patch
 * @param {Record<string, unknown>} [insertColumns]  仅新建行时额外写入的列
 */
export function upsertStateValue(table, ownerColumn, ownerId, fieldKey, patch = {}, insertColumns = {}) {
  const where = `${ownerColumn} = ? AND field_key = ?`;
  const selectRow = () => db.prepare(`SELECT * FROM ${table} WHERE ${where}`).get(ownerId, fieldKey);
  const existing = db.prepare(`SELECT id FROM ${table} WHERE ${where}`).get(ownerId, fieldKey);
  const now = Date.now();
  const hasDefault = Object.hasOwn(patch, 'defaultValueJson');
  const hasRuntime = Object.hasOwn(patch, 'runtimeValueJson');
  const touchUpdatedAt = patch.touchUpdatedAt ?? hasRuntime;
  const skipCreate = patch.skipCreate ?? false;

  if (existing) {
    const sets = [];
    const values = [];
    if (hasDefault) {
      sets.push('default_value_json = ?');
      values.push(patch.defaultValueJson);
    }
    if (hasRuntime) {
      sets.push('runtime_value_json = ?');
      values.push(patch.runtimeValueJson);
    }
    if (touchUpdatedAt) {
      sets.push('updated_at = ?');
      values.push(now);
    }
    if (sets.length === 0) return selectRow();
    db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE ${where}`).run(...values, ownerId, fieldKey);
    return selectRow();
  }

  if (skipCreate) return null;
  const id = crypto.randomUUID();
  const extraColumns = Object.keys(insertColumns);
  const columns = ['id', ownerColumn, ...extraColumns, 'field_key', 'default_value_json', 'runtime_value_json', 'updated_at'];
  db.prepare(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
  ).run(
    id,
    ownerId,
    ...Object.values(insertColumns),
    fieldKey,
    hasDefault ? patch.defaultValueJson : null,
    hasRuntime ? patch.runtimeValueJson : null,
    touchUpdatedAt ? now : 0,
  );
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
}
