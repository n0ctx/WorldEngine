import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/api/regex-rules.js', () => ({
  listRegexRules: vi.fn(),
}));

import { listRegexRules } from '../../src/api/regex-rules.js';
import { applyRules, invalidateCache, loadRules } from '../../src/utils/regex-runner.js';

describe('frontend regex runner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateCache();
  });

  it('按 scope/world/mode 过滤并按 sort_order 链式执行', async () => {
    listRegexRules.mockResolvedValue([
      { id: '2', name: 'second', enabled: true, scope: 'prompt_only', world_id: 'world-1', mode: 'chat', pattern: '狗', replacement: '狼', flags: 'g', sort_order: 2 },
      { id: '1', name: 'first', enabled: true, scope: 'prompt_only', world_id: 'world-1', mode: 'chat', pattern: '猫', replacement: '狗', flags: 'g', sort_order: 1 },
      { id: '3', name: 'writing-only', enabled: true, scope: 'prompt_only', world_id: null, mode: 'writing', pattern: '狼', replacement: '龙', flags: 'g', sort_order: 3 },
      { id: '4', name: 'other-scope', enabled: true, scope: 'ai_output', world_id: 'world-1', mode: 'chat', pattern: '狼', replacement: '虎', flags: 'g', sort_order: 4 },
    ]);

    await loadRules('chat');

    expect(applyRules('猫来了', 'prompt_only', 'world-1')).toBe('狼来了');
    expect(applyRules('狼来了', 'prompt_only', null, 'writing')).toBe('龙来了');
  });

  it('遇到非法规则或超长 pattern 时跳过但不中断后续规则', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    listRegexRules.mockResolvedValue([
      { id: 'bad', name: 'bad', enabled: true, scope: 'display_only', world_id: 'world-1', mode: 'chat', pattern: '[abc', replacement: 'x', flags: '', sort_order: 0 },
      { id: 'long', name: 'long', enabled: true, scope: 'display_only', world_id: 'world-1', mode: 'chat', pattern: 'a'.repeat(501), replacement: 'x', flags: '', sort_order: 1 },
      { id: 'good', name: 'good', enabled: true, scope: 'display_only', world_id: 'world-1', mode: 'chat', pattern: 'hero', replacement: 'HERO', flags: 'gi', sort_order: 2 },
    ]);

    await loadRules('chat');

    expect(applyRules('Hero hero', 'display_only', 'world-1')).toBe('HERO HERO');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('loadRules 失败时回退为空规则，invalidateCache 后不再处理文本', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    listRegexRules.mockRejectedValue(new Error('network down'));

    await loadRules('chat');
    expect(applyRules('原文', 'user_input', 'world-1')).toBe('原文');

    invalidateCache();
    expect(applyRules('原文', 'user_input', 'world-1')).toBe('原文');
    expect(warn).toHaveBeenCalled();
  });
});
