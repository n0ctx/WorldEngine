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

test('readTables 折叠关系表已有重复对：保留最旧 id、新值胜；archive 不去重', () => {
  const t = emptyTables();
  // 同一对（含反向顺序）的三行重复 active 数据，模拟历史脏数据
  t.tables.relations.rows.push(
    { id: 1, 主体A: '林清雪', 主体B: '张逸轩', 关系类型: '学长-学妹', '信任/敌意': '初识' },
    { id: 3, 主体A: '张逸轩', 主体B: '林清雪', 关系类型: '学长-学妹（外联部）', '债务/承诺': '承诺帮她进外联部' },
    { id: 5, 主体A: '林清雪', 主体B: '周鹏', 关系类型: '社团招新接触' },
  );
  t.tables.relations.nextId = 6;
  // archive 里同一对的两条已归档关系应保持各自独立
  t.archive.relations.push(
    { id: 1, 主体A: '林清雪', 主体B: '张逸轩', 归档原因: '旧' },
    { id: 2, 主体A: '林清雪', 主体B: '张逸轩', 归档原因: '新' },
  );
  writeTables('sDedup', t);
  const r = readTables('sDedup');
  const rows = r.tables.relations.rows;
  assert.equal(rows.length, 2); // 林↔张 合并为一行 + 林↔周
  const pair = rows.find((x) => x.id === 1);
  assert.equal(pair['关系类型'], '学长-学妹（外联部）'); // 新值胜
  assert.equal(pair['债务/承诺'], '承诺帮她进外联部');
  assert.equal(r.archive.relations.length, 2); // archive 不去重
});

test('deleteTableMemoryDir 清空', () => {
  writeTables('sE', emptyTables());
  deleteTableMemoryDir('sE');
  assert.equal(readTablesRaw('sE'), '');
});
