import test from 'node:test';
import assert from 'node:assert/strict';

import { useGuardFixture } from './guard-fixture.mjs';

const { makeRoot, write, run } = useGuardFixture('check-context-budget.mjs');

// count 个空函数：function_class_count 的硬上限是 50
const functions = (count) => Array.from({ length: count }, (_, i) => `export function f${i}() {}`).join('\n');

function fixture() {
  const root = makeRoot();
  write(root, 'backend/small.js', functions(3));
  write(root, 'backend/legacy.js', functions(55));
  assert.equal(run(root, '--update-baseline').status, 0);
  return root;
}

test('现状与基线一致时通过，历史超标只警告', () => {
  const result = run(fixture());
  assert.equal(result.status, 0, result.stdout);
});

test('新文件超硬上限失败', () => {
  const root = fixture();
  write(root, 'backend/fresh.js', functions(51));
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL 文件[^\n]*\n- backend\/fresh\.js/);
});

test('历史超标文件相对基线明显增长失败', () => {
  const root = fixture();
  write(root, 'backend/legacy.js', functions(70));
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL 文件[^\n]*\n- backend\/legacy\.js/);
});
