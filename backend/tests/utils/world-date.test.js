import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import {
  compareWorldDate, currentWorldDate, deriveAge, normalizeBirthDate, parseWorldDate, yearsBetween,
} from '../../utils/world-date.js';

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

// ─── currentWorldDate / normalizeBirthDate ─────────────────────────────────────────────

test('currentWorldDate 有故事时间时用故事时间，未设置或无法解析时按系统时间（上海时区）', (t) => {
  t.after(() => mock.timers.reset());
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-06T11:30:00Z') });
  assert.deepEqual(currentWorldDate('62-10-12T15:30'), parseWorldDate('62-10-12T15:30'));
  assert.deepEqual(currentWorldDate(null), parseWorldDate('2026-10-06T19:30'));
  assert.deepEqual(currentWorldDate('道元历205年'), parseWorldDate('2026-10-06T19:30'));
});

test('normalizeBirthDate 接受世界日期与问号，拒绝纪年名、占位词与非字符串', () => {
  assert.equal(normalizeBirthDate(' 205-03-12 '), '205-03-12');
  assert.equal(normalizeBirthDate('?'), '?');
  assert.equal(normalizeBirthDate('？'), '?');
  assert.equal(normalizeBirthDate('道元历205-03-12'), null);
  assert.equal(normalizeBirthDate('未知'), null);
  assert.equal(normalizeBirthDate(null), null);
});
