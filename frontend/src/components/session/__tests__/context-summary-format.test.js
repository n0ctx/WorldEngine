import { describe, expect, it } from 'vitest';

import { statsHint } from '../context-summary-format.js';

const base = { latestRound: 20, coveredRounds: 0, rawRounds: 20, usage: null, lastOutcome: null, lastError: null };

describe('statsHint 暂缓重试提示', () => {
  it('连续没整理成功不足 2 次时不提示', () => {
    expect(statsHint({ ...base, noWriteStreak: 0 })).not.toContain('暂缓重试');
    expect(statsHint({ ...base, noWriteStreak: 1, lastOutcome: 'failed' })).not.toContain('暂缓重试');
  });

  it('连续 2 次及以上时说明次数与暂缓重试', () => {
    expect(statsHint({ ...base, noWriteStreak: 2 })).toContain('已连续 2 次没整理成功，暂缓重试');
    expect(statsHint({ ...base, noWriteStreak: 5, lastOutcome: 'failed', lastError: '服务暂不可用' }))
      .toContain('上次整理失败：服务暂不可用。已连续 5 次没整理成功，暂缓重试。');
  });

  it('旧接口没有该字段时不报错也不提示', () => {
    expect(statsHint(base)).not.toContain('暂缓重试');
  });
});
