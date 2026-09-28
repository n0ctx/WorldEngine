import test from 'node:test';
import assert from 'node:assert/strict';

import { compareWorldDate, deriveAge, parseWorldDate, yearsBetween } from '../../utils/world-date.js';

// ─── parseWorldDate ─────────────────────────────────────────────

test('parseWorldDate 解析日期与日期时间，年份位数不限', () => {
  assert.deepEqual(parseWorldDate('1000-03-15'), { year: 1000, month: 3, day: 15, hour: 0, minute: 0 });
  assert.deepEqual(parseWorldDate('238-04-20T00:00'), { year: 238, month: 4, day: 20, hour: 0, minute: 0 });
  assert.deepEqual(parseWorldDate('12000-01-01T23:59'), { year: 12000, month: 1, day: 1, hour: 23, minute: 59 });
});

test('parseWorldDate 拒绝非法输入', () => {
  assert.equal(parseWorldDate(''), null);
  assert.equal(parseWorldDate('not-a-date'), null);
  assert.equal(parseWorldDate('1000-13-01'), null);
  assert.equal(parseWorldDate('1000-01-32'), null);
  assert.equal(parseWorldDate('1000-01-01T25:00'), null);
  assert.equal(parseWorldDate(null), null);
  assert.equal(parseWorldDate(undefined), null);
});

// ─── compareWorldDate / yearsBetween ─────────────────────────────────────────────

test('compareWorldDate 按年月日时分比较', () => {
  const a = parseWorldDate('1000-01-01T00:00');
  const b = parseWorldDate('1000-01-01T00:01');
  const c = parseWorldDate('1001-01-01');
  assert.ok(compareWorldDate(a, b) < 0);
  assert.ok(compareWorldDate(b, a) > 0);
  assert.ok(compareWorldDate(a, c) < 0);
  assert.equal(compareWorldDate(a, a), 0);
});

test('yearsBetween 跨年整年计算，生日未到不加一岁', () => {
  const from = parseWorldDate('1000-06-15');
  assert.equal(yearsBetween(from, parseWorldDate('1010-06-15')), 10);
  assert.equal(yearsBetween(from, parseWorldDate('1010-06-14')), 9, '生日未到应少算一年');
  assert.equal(yearsBetween(from, parseWorldDate('1010-06-16')), 10);
});

// ─── deriveAge ─────────────────────────────────────────────

test('deriveAge：有 birth_date 且有世界日期，按相隔整年计算', () => {
  const worldDate = parseWorldDate('1020-06-15');
  const result = deriveAge({ birth_date: '1000-06-15' }, worldDate);
  assert.deepEqual(result, { age: 20, text: '20 岁' });
});

test('deriveAge：有 age_recorded.as_of_date 且有世界日期，按 age + 相隔整年计算', () => {
  const worldDate = parseWorldDate('1005-01-01');
  const result = deriveAge({ age_recorded: { age: 20, as_of_date: '1000-01-01', as_of_round: 3 } }, worldDate);
  assert.deepEqual(result, { age: 25, text: '25 岁' });
});

test('deriveAge：只有 age_recorded，无可用世界日期，原样显示记录轮次', () => {
  const result = deriveAge({ age_recorded: { age: 20, as_of_round: 7 } }, null);
  assert.deepEqual(result, { age: null, text: '约 20 岁（记于第 7 轮）' });
});

test('deriveAge：既无 birth_date 也无 age_recorded，返回 null', () => {
  assert.equal(deriveAge({}, parseWorldDate('1000-01-01')), null);
  assert.equal(deriveAge(undefined, null), null);
});

test('deriveAge：无世界日期时不推算，即使有 birth_date', () => {
  const result = deriveAge({ birth_date: '1000-01-01' }, null);
  assert.equal(result, null);
});
