import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { relativeTime } from '../../src/utils/time.js';

describe('time utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-29T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('按分钟/小时/天/月/年格式化相对时间', () => {
    const now = Date.now();
    expect(relativeTime()).toBe('');
    expect(relativeTime(now - 30_000)).toBe('刚刚');
    expect(relativeTime(now - 5 * 60_000)).toBe('5 分钟前');
    expect(relativeTime(now - 3 * 60 * 60_000)).toBe('3 小时前');
    expect(relativeTime(now - 9 * 24 * 60 * 60_000)).toBe('9 天前');
    expect(relativeTime(now - 65 * 24 * 60 * 60_000)).toBe('2 个月前');
    expect(relativeTime(now - 800 * 24 * 60 * 60_000)).toBe('2 年前');
  });
});
