import test from 'node:test';
import assert from 'node:assert/strict';

import { validateStateValue } from '../services/state-values.js';

test('validateStateValue 支持 list 字段的字符串拆分', function () {
  const result = validateStateValue('长剑，圆盾', {
    type: 'list',
    allow_empty: 1,
  });

  assert.deepEqual(result, ['长剑', '圆盾']);
});

test('validateStateValue 拒绝超出范围的 number', function () {
  const result = validateStateValue(999, {
    type: 'number',
    min_value: 0,
    max_value: 100,
    allow_empty: 0,
  });

  assert.equal(result, undefined);
});

test('validateStateValue 允许空值字段返回 null', function () {
  const result = validateStateValue('', {
    type: 'text',
    allow_empty: 1,
  });

  assert.equal(result, null);
});
