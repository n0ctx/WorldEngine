import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchSessionStateValues: vi.fn(),
  fetchDailyEntries: vi.fn(),
}));

vi.mock('../../src/api/session-state-values.js', () => ({
  fetchSessionStateValues: (...args) => mocks.fetchSessionStateValues(...args),
}));
vi.mock('../../src/api/daily-entries.js', () => ({
  fetchDailyEntries: (...args) => mocks.fetchDailyEntries(...args),
}));

import { useSessionState } from '../../src/hooks/useSessionState.js';

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useSessionState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.fetchSessionStateValues.mockReset();
    mocks.fetchDailyEntries.mockReset();
    mocks.fetchSessionStateValues.mockResolvedValue({ world: [{ field_key: 'weather' }], persona: [], character: [] });
    mocks.fetchDailyEntries.mockResolvedValue([{ date_str: '2026-04-22' }]);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('首次加载时会请求状态和日记', async () => {
    const { result } = renderHook(() => useSessionState('session-1'));

    expect(result.current.stateData).toBeNull();
    expect(result.current.diaryEntries).toBeNull();

    await flushAsync();
    expect(result.current.stateData).toEqual({ world: [{ field_key: 'weather' }], persona: [], character: [] });
    expect(result.current.diaryEntries).toEqual([{ date_str: '2026-04-22' }]);
    expect(mocks.fetchSessionStateValues).toHaveBeenCalledWith('session-1');
    expect(mocks.fetchDailyEntries).toHaveBeenCalledWith('session-1');
  });

  it('tick 变化时会重新取数并在定时器结束后清除变更标记', async () => {
    const { result, rerender } = renderHook(
      ({ stateTick, diaryTick }) => useSessionState('session-1', stateTick, diaryTick),
      { initialProps: { stateTick: 0, diaryTick: 0 } },
    );

    await flushAsync();

    mocks.fetchSessionStateValues.mockResolvedValueOnce({ world: [], persona: [{ field_key: 'mood' }], character: [] });
    mocks.fetchDailyEntries.mockResolvedValueOnce([{ date_str: '2026-04-23' }]);

    rerender({ stateTick: 1, diaryTick: 1 });

    await flushAsync();
    expect(result.current.stateData).toEqual({ world: [], persona: [{ field_key: 'mood' }], character: [] });
    expect(result.current.diaryEntries).toEqual([{ date_str: '2026-04-23' }]);
    expect(result.current.stateJustChanged).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(1800);
    });
    expect(result.current.stateJustChanged).toBe(false);
  });

  it('请求失败时会回退为空结构并在 session 清空时重置状态', async () => {
    mocks.fetchSessionStateValues.mockRejectedValueOnce(new Error('boom'));
    mocks.fetchDailyEntries.mockRejectedValueOnce(new Error('boom'));

    const { result, rerender } = renderHook(
      ({ sessionId }) => useSessionState(sessionId),
      { initialProps: { sessionId: 'session-1' } },
    );

    await flushAsync();
    expect(result.current.stateData).toEqual({ world: [], persona: [], character: [] });
    expect(result.current.diaryEntries).toEqual([]);

    rerender({ sessionId: null });
    await flushAsync();
    expect(result.current.stateData).toEqual({ world: [], persona: [], character: [] });
    expect(result.current.diaryEntries).toEqual([]);
  });

  it('卸载时会清理变更定时器', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const { result, rerender, unmount } = renderHook(
      ({ tick }) => useSessionState('session-1', tick, tick),
      { initialProps: { tick: 0 } },
    );

    await flushAsync();

    mocks.fetchSessionStateValues.mockResolvedValueOnce({ world: [], persona: [], character: [{ field_key: 'hp' }] });
    mocks.fetchDailyEntries.mockResolvedValueOnce([]);
    rerender({ tick: 1 });
    await flushAsync();
    expect(result.current.stateJustChanged).toBe(true);

    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
