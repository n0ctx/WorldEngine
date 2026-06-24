import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOps } from '../../services/table-memory-ops.js';
import { emptyTables } from '../../services/table-memory-schema.js';

test('add 分配自增 id 并保留别名、丢弃未知列', () => {
  const { tables, applied } = applyOps(emptyTables(), [
    { table: 'places', op: 'add', row: { 地点: '城东仓库', 所属势力: '黑帮', 不存在列: 'x', 别名: '仓库' } },
  ]);
  assert.equal(applied, 1);
  const rows = tables.tables.places.rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 1);
  assert.equal(rows[0]['地点'], '城东仓库');
  assert.equal(rows[0]['别名'], '仓库');
  assert.ok(!('不存在列' in rows[0]));
  assert.equal(tables.tables.places.nextId, 2);
});

test('update 按 id 只改给定列，未知 id 计入 dropped', () => {
  let t = applyOps(emptyTables(), [{ table: 'relations', op: 'add', row: { 主体A: '张三', 信任: '0' } }]).tables;
  const r = applyOps(t, [
    { table: 'relations', op: 'update', id: 1, fields: { '信任/敌意': '-2', 最近变化: '撒谎被识破' } },
    { table: 'relations', op: 'update', id: 99, fields: { 主体A: 'X' } },
  ]);
  assert.equal(r.applied, 1);
  assert.equal(r.dropped, 1);
  const row = r.tables.tables.relations.rows[0];
  assert.equal(row['信任/敌意'], '-2');
  assert.equal(row['最近变化'], '撒谎被识破');
  assert.equal(row['主体A'], '张三');
});

test('close 把行移入 archive，rows 清空', () => {
  let t = applyOps(emptyTables(), [{ table: 'plotlines', op: 'add', row: { 剧情线: '救妹' } }]).tables;
  const r = applyOps(t, [{ table: 'plotlines', op: 'close', id: 1, reason: '妹妹已死' }]);
  assert.equal(r.tables.tables.plotlines.rows.length, 0);
  assert.equal(r.tables.archive.plotlines.length, 1);
  assert.equal(r.tables.tables.plotlines.archive, undefined); // archive 不挂在表节点下
});

test('close 后 archive[plotlines] 含该行；noop 与未知 op 安全', () => {
  let t = applyOps(emptyTables(), [{ table: 'plotlines', op: 'add', row: { 剧情线: '救妹' } }]).tables;
  const r = applyOps(t, [
    { table: 'plotlines', op: 'close', id: 1 },
    { table: 'items', op: 'noop' },
    { table: 'items', op: 'delete', id: 1 },
    { table: '不存在表', op: 'add', row: {} },
    'garbage',
  ]);
  assert.equal(r.tables.archive.plotlines.length, 1);
  assert.equal(r.tables.archive.plotlines[0]['剧情线'], '救妹');
  assert.equal(r.dropped, 3); // delete + 未知表 + garbage
});

test('字段超长被截断到 FIELD_MAX_CHARS', () => {
  const long = '字'.repeat(200);
  const { tables } = applyOps(emptyTables(), [{ table: 'world', op: 'add', row: { '规则/事实': long } }]);
  assert.equal(tables.tables.world.rows[0]['规则/事实'].length, 60);
});

test('close 未知 id → op 被 drop，archive 仍为空', () => {
  const t = emptyTables();
  const r = applyOps(t, [{ table: 'items', op: 'close', id: 999, reason: '不存在' }]);
  assert.equal(r.dropped, 1);
  assert.equal(r.tables.tables.items.rows.length, 0);
  assert.equal(r.tables.archive.items.length, 0);
});

test('update fields 只含未知列 → op 被 drop，行不变', () => {
  let t = applyOps(emptyTables(), [{ table: 'relations', op: 'add', row: { 主体A: '张三', 信任: '0' } }]).tables;
  const before = JSON.stringify(t.tables.relations.rows[0]);
  const r = applyOps(t, [{ table: 'relations', op: 'update', id: 1, fields: { 不存在列: 'x' } }]);
  assert.equal(r.dropped, 1);
  assert.equal(JSON.stringify(r.tables.tables.relations.rows[0]), before);
});

test('applyOps 不修改入参', () => {
  const orig = emptyTables();
  const snapshot = JSON.stringify(orig);
  applyOps(orig, [{ table: 'items', op: 'add', row: { 物品: '钥匙' } }]);
  assert.equal(JSON.stringify(orig), snapshot);
});
