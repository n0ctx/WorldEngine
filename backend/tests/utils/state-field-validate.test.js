import test from 'node:test';
import assert from 'node:assert/strict';

import { validateValue } from '../../utils/state-field-validate.js';
import { STATE_LIST_MAX_ITEMS } from '../../utils/constants.js';

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

test('validateValue：text/enum/datetime 只接受各自格式允许的值', () => {
  assert.equal(validateValue('文本', { type: 'text' }), '文本');
  assert.equal(validateValue(12, { type: 'text' }), undefined);
  assert.equal(validateValue('晴', { type: 'enum', enum_options: ['晴', '雨'] }), '晴');
  assert.equal(validateValue('雪', { type: 'enum', enum_options: ['晴', '雨'] }), undefined);
  assert.equal(validateValue('1000-03-15T14:30', { type: 'datetime' }), '1000-03-15T14:30');
  assert.equal(validateValue('1000-3-15T14:30', { type: 'datetime' }), undefined);
  assert.equal(validateValue('anything', { type: 'unknown' }), undefined);
});

test('validateValue：list 保留末尾条目并按共享上限截断', () => {
  const values = Array.from({ length: STATE_LIST_MAX_ITEMS + 2 }, (_, index) => `item-${index}`);
  const result = validateValue(values, { type: 'list' });

  assert.equal(result.length, STATE_LIST_MAX_ITEMS);
  assert.deepEqual(result, values.slice(-STATE_LIST_MAX_ITEMS));
});

test('validateValue：table 解析对象、逐列夹限，并忽略非法列值', () => {
  assert.deepEqual(validateValue('{"hp":-2,"mana":"13","unknown":5}', {
    type: 'table',
    table_columns: [
      { key: 'hp', min: 0, max: 100 },
      { key: 'mana', max: 10 },
      { key: 'energy', min: 1 },
    ],
  }), { hp: 0, mana: 10 });
  assert.equal(validateValue('[{"hp":1}]', {
    type: 'table',
    table_columns: [{ key: 'hp' }],
  }), undefined);
  assert.deepEqual(validateValue('{"hp":"invalid"}', {
    type: 'table',
    allow_empty: 1,
    table_columns: [{ key: 'hp' }],
  }), {});
});
