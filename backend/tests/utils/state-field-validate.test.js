import test from 'node:test';
import assert from 'node:assert/strict';

import { validateValue } from '../../utils/state-field-validate.js';

// 覆盖 combined-state-updater.js 与 state-extract.js 共用的类型校验规则里，
// falsy 但合法的值容易被误判为"空值"进而丢弃的边界情况。

test('validateValue：number 类型的合法 falsy 值 0 不被当作空值丢弃', () => {
  assert.equal(validateValue(0, { type: 'number', allow_empty: 0 }), 0);
  assert.equal(validateValue(0, { type: 'number', min_value: 0, allow_empty: 0 }), 0);
  assert.equal(validateValue('0', { type: 'number', min_value: 0, allow_empty: 0 }), 0);
});

test('validateValue：boolean 类型的合法 falsy 值 false 不被当作空值丢弃', () => {
  assert.equal(validateValue(false, { type: 'boolean', allow_empty: 0 }), false);
  assert.equal(validateValue('false', { type: 'boolean', allow_empty: 0 }), false);
});

test('validateValue：list 类型的空数组按 allow_empty 决定是否保留', () => {
  assert.deepEqual(validateValue([], { type: 'list', allow_empty: 1 }), []);
  assert.equal(validateValue([], { type: 'list', allow_empty: 0 }), undefined);
});

test('validateValue：text/enum 空字符串即使 allow_empty=1 也返回 null（视为“未给出建议”，与空数组的“显式清空”语义不同）', () => {
  // 这是 combined-state-updater.js 原实现就有的既有行为，本次提取未改变；
  // 记录在此，避免后续改动在不知情的情况下悄悄改变共享校验语义。
  assert.equal(validateValue('', { type: 'text', allow_empty: 1 }), null);
  assert.equal(validateValue('', { type: 'enum', allow_empty: 1, enum_options: ['a'] }), null);
});
