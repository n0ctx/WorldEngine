import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeOpenAIToolCalls } from '../../llm/providers/_shared/converters.js';

const rawCall = (args, extra = {}) => ({ id: 'c1', type: 'function', function: { name: 'update', arguments: args }, ...extra });

test('normalizeOpenAIToolCalls: JSON 字符串参数解析成对象，回写原样', () => {
  const { toolCalls, assistantToolCalls } = normalizeOpenAIToolCalls([rawCall('{"a":1}')], 0);
  assert.deepEqual(toolCalls, [{ id: 'c1', name: 'update', arguments: { a: 1 } }]);
  assert.deepEqual(assistantToolCalls, [rawCall('{"a":1}')]);
});

test('normalizeOpenAIToolCalls: 参数已是对象时直接用，回写序列化成字符串', () => {
  const { toolCalls, assistantToolCalls } = normalizeOpenAIToolCalls([rawCall({ a: { b: [1] } })], 0);
  assert.deepEqual(toolCalls[0].arguments, { a: { b: [1] } });
  assert.equal(toolCalls[0].argumentsError, undefined);
  assert.equal(assistantToolCalls[0].function.arguments, '{"a":{"b":[1]}}');
});

test('normalizeOpenAIToolCalls: 空串、空白与缺省参数视为 {}', () => {
  const { toolCalls, assistantToolCalls } = normalizeOpenAIToolCalls([rawCall(''), rawCall('  '), rawCall(undefined), rawCall(null)], 0);
  assert.deepEqual(toolCalls.map((c) => c.arguments), [{}, {}, {}, {}]);
  assert.equal(toolCalls.some((c) => 'argumentsError' in c), false);
  assert.deepEqual(assistantToolCalls.map((c) => c.function.arguments), ['{}', '{}', '{}', '{}']);
});

test('normalizeOpenAIToolCalls: 非法 JSON 标记 argumentsError，含原文前 200 字符', () => {
  const broken = `{"content": "${'长'.repeat(300)}`;
  const { toolCalls, assistantToolCalls } = normalizeOpenAIToolCalls([rawCall(broken)], 0);
  assert.deepEqual(toolCalls[0].arguments, {});
  assert.ok(toolCalls[0].argumentsError.endsWith(broken.slice(0, 200)));
  assert.equal(toolCalls[0].argumentsError.includes(broken.slice(0, 201)), false);
  assert.equal(assistantToolCalls[0].function.arguments, '{}');
});

test('normalizeOpenAIToolCalls: 缺 id 补 call_<iter>_<idx>，两份列表 id 一致，已有 id 不动', () => {
  const raws = [
    { function: { name: 'read', arguments: '{}' } },
    rawCall('{}', { id: 'keep' }),
    { id: '', type: 'function', function: { name: 'find', arguments: '{}' } },
  ];
  const { toolCalls, assistantToolCalls } = normalizeOpenAIToolCalls(raws, 3);
  assert.deepEqual(toolCalls.map((c) => c.id), ['call_3_0', 'keep', 'call_3_2']);
  assert.deepEqual(assistantToolCalls.map((c) => c.id), ['call_3_0', 'keep', 'call_3_2']);
  assert.equal(assistantToolCalls[0].type, 'function');
  assert.deepEqual(toolCalls.map((c) => c.name), ['read', 'update', 'find']);
  // 不改动入参
  assert.equal(raws[0].id, undefined);
});
