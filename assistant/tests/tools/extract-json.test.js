import test from 'node:test';
import assert from 'node:assert/strict';

import { extractJson } from '../../server/tools/extract-json.js';

test('extractJson 会剥离 JSON 前的 think 块并解析对象', () => {
  const parsed = extractJson(`
    <think>先分析</think>
    {"type":"world-card","changes":{"name":"白港"}}
  `);

  assert.equal(parsed.type, 'world-card');
  assert.equal(parsed.changes.name, '白港');
});

test('extractJson 会优先按 prefer 返回首个或最后一个对象', () => {
  const raw = '前缀 {"name":"first"} 中间 {"name":"last"}';

  assert.equal(extractJson(raw, { prefer: 'first' }).name, 'first');
  assert.equal(extractJson(raw).name, 'last');
});

test('extractJson 不会误删 JSON 字符串值里的 think 标签', () => {
  const parsed = extractJson('{"message":"<think>保留</think>"}');
  assert.equal(parsed.message, '<think>保留</think>');
});

test('extractJson 在空输出或无对象时抛出明确错误', () => {
  assert.throws(() => extractJson('   '), /输出为空/);
  assert.throws(() => extractJson('没有 JSON'), /找不到 JSON 对象/);
});
