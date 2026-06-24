import test from 'node:test';
import assert from 'node:assert/strict';
import { TABLE_SCHEMAS, TABLE_KEYS, emptyTables } from '../../services/table-memory-schema.js';

test('TABLE_SCHEMAS 含 6 张表且列不含内置 id/别名', () => {
  assert.deepEqual(TABLE_KEYS, ['relations', 'items', 'places', 'plotlines', 'factions', 'resources']);
  for (const key of TABLE_KEYS) {
    const cols = TABLE_SCHEMAS[key].columns;
    assert.ok(Array.isArray(cols) && cols.length > 0);
    assert.ok(!cols.includes('id') && !cols.includes('别名'), `${key} 列不应含 id/别名`);
  }
  assert.equal(TABLE_SCHEMAS.relations.name, '关系表');
});

test('emptyTables 每表 rows 为空、nextId 为 1、archive 齐全', () => {
  const t = emptyTables();
  assert.equal(t.version, 1);
  for (const key of TABLE_KEYS) {
    assert.deepEqual(t.tables[key], { rows: [], nextId: 1 });
    assert.deepEqual(t.archive[key], []);
  }
});
