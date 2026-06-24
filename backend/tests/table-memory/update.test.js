// backend/tests/table-memory/update.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

const { __parseOps } = await import('../../services/table-memory.js');

test('__parseOps 剥 think 与围栏后解析数组', () => {
  const raw = '<think>琢磨</think>\n```json\n[{"table":"items","op":"noop"}]\n```';
  assert.deepEqual(__parseOps(raw), [{ table: 'items', op: 'noop' }]);
});

test('__parseOps 截取首尾方括号之间内容', () => {
  const raw = '好的：[{"table":"places","op":"add","row":{"地点":"城东"}}] 完毕';
  const ops = __parseOps(raw);
  assert.equal(ops[0].op, 'add');
});

test('__parseOps 坏 JSON 返回 null', () => {
  assert.equal(__parseOps('not json at all'), null);
  assert.equal(__parseOps('[{bad'), null);
});
