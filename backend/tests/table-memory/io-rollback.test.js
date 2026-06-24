import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-'));
process.env.WE_DATA_DIR = tmp;

const { readTables, writeTables, readTablesRaw, deleteTableMemoryDir, restoreTablesFromTurnRecord } =
  await import('../../services/table-memory.js');
const { emptyTables } = await import('../../services/table-memory-schema.js');

test('无文件时 readTables 返回空表、readTablesRaw 返回空串', () => {
  assert.deepEqual(readTables('sX'), emptyTables());
  assert.equal(readTablesRaw('sX'), '');
});

test('write 后 read 往返一致', () => {
  const t = emptyTables();
  t.tables.items.rows.push({ id: 1, 物品: '钥匙' });
  t.tables.items.nextId = 2;
  writeTables('sA', t);
  assert.deepEqual(readTables('sA'), t);
});

test('restore: lastRecord 为空 → 删目录', () => {
  writeTables('sB', emptyTables());
  restoreTablesFromTurnRecord('sB', null);
  assert.equal(readTablesRaw('sB'), '');
});

test('restore: 快照为 null（旧记录）→ 文件不动', () => {
  const t = emptyTables(); t.tables.factions.rows.push({ id: 1, '势力': '阴罗宗' });
  t.tables.factions.nextId = 2;
  writeTables('sC', t);
  restoreTablesFromTurnRecord('sC', { table_memory_snapshot: null });
  assert.deepEqual(readTables('sC'), t);
});

test('restore: 有快照 → 覆盖写', () => {
  const snap = emptyTables(); snap.tables.places.rows.push({ id: 1, 地点: '旧城' });
  writeTables('sD', emptyTables()); // 当前是空
  restoreTablesFromTurnRecord('sD', { table_memory_snapshot: JSON.stringify(snap) });
  assert.equal(readTables('sD').tables.places.rows[0].地点, '旧城');
});

test('deleteTableMemoryDir 清空', () => {
  writeTables('sE', emptyTables());
  deleteTableMemoryDir('sE');
  assert.equal(readTablesRaw('sE'), '');
});
