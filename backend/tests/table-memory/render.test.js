import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOps, renderTablesToMarkdown } from '../../services/table-memory-ops.js';
import { emptyTables } from '../../services/table-memory-schema.js';

test('空表渲染为空串', () => {
  assert.equal(renderTablesToMarkdown(emptyTables()), '');
});

test('withId=false 不含 id 列，含表标题与列头', () => {
  const { tables } = applyOps(emptyTables(), [
    { table: 'items', op: 'add', row: { 物品: '钥匙', 状态: '完好' } },
  ]);
  const md = renderTablesToMarkdown(tables, { withId: false });
  assert.match(md, /### 物品表/);
  assert.match(md, /\| 物品 \|/);
  assert.ok(!/\| id \|/.test(md));
  assert.match(md, /钥匙/);
});

test('withId=true 首列为 id', () => {
  const { tables } = applyOps(emptyTables(), [
    { table: 'items', op: 'add', row: { 物品: '钥匙' } },
  ]);
  const md = renderTablesToMarkdown(tables, { withId: true });
  assert.match(md, /\| id \| 物品 \|/);
  assert.match(md, /\| 1 \|/);
});

test('只渲染非空表', () => {
  const { tables } = applyOps(emptyTables(), [
    { table: 'places', op: 'add', row: { 地点: '城东' } },
  ]);
  const md = renderTablesToMarkdown(tables);
  assert.match(md, /### 地点表/);
  assert.ok(!/### 关系表/.test(md));
});
