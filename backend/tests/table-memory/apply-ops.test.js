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
    { table: 'relations', op: 'update', id: 1, fields: { '信任/敌意': '-2', '债务/承诺': '欠一条命' } },
    { table: 'relations', op: 'update', id: 99, fields: { 主体A: 'X' } },
  ]);
  assert.equal(r.applied, 1);
  assert.equal(r.dropped, 1);
  const row = r.tables.tables.relations.rows[0];
  assert.equal(row['信任/敌意'], '-2');
  assert.equal(row['债务/承诺'], '欠一条命');
  assert.equal(row['主体A'], '张三');
});

test('close 把行移入 archive，rows 清空', () => {
  let t = applyOps(emptyTables(), [{ table: 'plotlines', op: 'add', row: { 既定事实: '妹妹被掳走' } }]).tables;
  const r = applyOps(t, [{ table: 'plotlines', op: 'close', id: 1, reason: '设定撤销' }]);
  assert.equal(r.tables.tables.plotlines.rows.length, 0);
  assert.equal(r.tables.archive.plotlines.length, 1);
  assert.equal(r.tables.archive.plotlines[0]['归档原因'], '设定撤销'); // close 的 reason 记进归档
  assert.equal(r.tables.tables.plotlines.archive, undefined); // archive 不挂在表节点下
});

test('close 后 archive[plotlines] 含该行；noop 与未知 op 安全', () => {
  let t = applyOps(emptyTables(), [{ table: 'plotlines', op: 'add', row: { 既定事实: '妹妹被掳走' } }]).tables;
  const r = applyOps(t, [
    { table: 'plotlines', op: 'close', id: 1 },
    { table: 'items', op: 'noop' },
    { table: 'items', op: 'delete', id: 1 },
    { table: '不存在表', op: 'add', row: {} },
    'garbage',
  ]);
  assert.equal(r.tables.archive.plotlines.length, 1);
  assert.equal(r.tables.archive.plotlines[0]['既定事实'], '妹妹被掳走');
  assert.equal(r.dropped, 3); // delete + 未知表 + garbage
});

test('字段超长被截断到 FIELD_MAX_CHARS', () => {
  const long = '字'.repeat(200);
  const { tables } = applyOps(emptyTables(), [{ table: 'factions', op: 'add', row: { '势力': long } }]);
  assert.equal(tables.tables.factions.rows[0]['势力'].length, 60);
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

// ── 行数上限兜底 ────────────────────────────────────────────────
function seedItems(n) {
  const ops = Array.from({ length: n }, (_, i) => ({ table: 'items', op: 'add', row: { 物品: `物${i + 1}` } }));
  return applyOps(emptyTables(), ops).tables;
}

test('无 rowLimits（默认）→ 不限制，不触发归档', () => {
  const r = applyOps(seedItems(5), [{ table: 'items', op: 'add', row: { 物品: '新物' } }]);
  assert.equal(r.tables.tables.items.rows.length, 6);
  assert.equal(r.tables.archive.items.length, 0);
  assert.deepEqual(r.autoArchived, {});
});

test('limit=0 视为不限制', () => {
  const r = applyOps(seedItems(5), [{ table: 'items', op: 'add', row: { 物品: '新物' } }], { items: 0 });
  assert.equal(r.tables.tables.items.rows.length, 6);
  assert.equal(r.tables.archive.items.length, 0);
});

test('超限时兜底归档最旧（id 最小）的行并打自动归档原因', () => {
  // 5 行（id 1..5），上限 3，add 1 行 → 6 行 → 兜底归档 3 行最旧（id 1,2,3）
  const r = applyOps(seedItems(5), [{ table: 'items', op: 'add', row: { 物品: '新物' } }], { items: 3 });
  const kept = r.tables.tables.items.rows;
  assert.equal(kept.length, 3);
  assert.deepEqual(kept.map((x) => x.id), [4, 5, 6]);
  assert.equal(r.autoArchived.items, 3);
  const archived = r.tables.archive.items;
  assert.deepEqual(archived.map((x) => x.id), [1, 2, 3]);
  for (const row of archived) assert.equal(row['归档原因'], '系统自动归档（超出行数上限）');
});

test('LLM 先 close 再 add 恰好填满 → 不触发兜底', () => {
  // 3 行（id 1..3），上限 3：close id1 + add 1 → 仍 3 行
  const r = applyOps(seedItems(3), [
    { table: 'items', op: 'close', id: 1, reason: '消耗' },
    { table: 'items', op: 'add', row: { 物品: '新物' } },
  ], { items: 3 });
  assert.equal(r.tables.tables.items.rows.length, 3);
  assert.equal(r.autoArchived.items, undefined); // 未触发兜底
  assert.equal(r.tables.archive.items.length, 1);
  assert.equal(r.tables.archive.items[0]['归档原因'], '消耗'); // 保留 LLM 给的原因
});
