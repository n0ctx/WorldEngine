import React from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useReducedMotion: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  useReducedMotion: () => mocks.useReducedMotion(),
}));

import { useMotion } from '../../src/core/hooks/useMotion.js';
import { GESTURE, GLITCH, STREAM, transitions, variants } from '../../src/core/utils/motion.js';

describe('useMotion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('在普通模式下透传参数', () => {
    mocks.useReducedMotion.mockReturnValue(false);
    const { result } = renderHook(() => useMotion());

    expect(result.current.reduced).toBe(false);
    expect(result.current.duration(0.3)).toBe(0.3);
    expect(result.current.ease([1, 2, 3])).toEqual([1, 2, 3]);
    expect(result.current.transition('signal')).toBe(transitions.signal);
    expect(result.current.transition('signal', { delay: 0.3 })).toEqual({ ...transitions.signal, delay: 0.3 });
  });

  it('在 reduced motion 下清零动效', () => {
    mocks.useReducedMotion.mockReturnValue(true);
    const { result } = renderHook(() => useMotion());

    expect(result.current.reduced).toBe(true);
    expect(result.current.duration(0.3)).toBe(0);
    expect(result.current.ease([1, 2, 3])).toBe('linear');
    expect(result.current.transition('signal', { delay: 0.3 })).toMatchObject({ duration: 0, delay: 0 });
  });

  it('普通模式下按压瞬时到位，入场用信号锁定', () => {
    mocks.useReducedMotion.mockReturnValue(false);
    const { result } = renderHook(() => useMotion());

    expect(result.current.gesture('press')).toEqual({ ...GESTURE.press, transition: transitions.press });
    // 禁用时去掉手势目标，但保留 transition，按下后变禁用的按钮仍能复原
    expect(result.current.gesture('press', { disabled: true })).toEqual({ transition: transitions.press });
    expect(result.current.variant('signalIn')).toBe(variants.signalIn);
  });

  it('reduced motion 下关闭手势，信号锁定只留终值、离场瞬时', () => {
    mocks.useReducedMotion.mockReturnValue(true);
    const { result } = renderHook(() => useMotion());

    expect(result.current.gesture('portal')).toEqual({});
    expect(result.current.gesture('sink', { disabled: true })).toEqual({});
    expect(result.current.variant('signalIn')).toEqual({
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
      exit: { opacity: 0, transition: { ...variants.signalIn.exit.transition, duration: 0 } },
    });
  });

  it('流式输出与信号故障的时长以 CSS 变量给出，reduced motion 下为 null', () => {
    mocks.useReducedMotion.mockReturnValue(false);
    const { result } = renderHook(() => useMotion());
    expect(result.current.stream()).toEqual({
      '--we-stream-char-duration': `${STREAM.char.duration * 1000}ms`,
      '--we-stream-caret-duration': `${STREAM.caret.duration * 1000}ms`,
      '--we-stream-caret-out-duration': `${Math.round(STREAM.caretOut.duration * 1000)}ms`,
    });
    expect(result.current.glitch()).toMatchObject({ '--we-glitch-burst': `${GLITCH.burst * 1000}ms` });

    mocks.useReducedMotion.mockReturnValue(true);
    const { result: reduced } = renderHook(() => useMotion());
    expect(reduced.current.stream()).toBeNull();
    expect(reduced.current.glitch()).toBeNull();
  });
});
