import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useReducedMotion: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  useReducedMotion: () => mocks.useReducedMotion(),
}));

import { useMotion } from '../../src/core/hooks/useMotion.js';
import { DEFAULT_MOTION_PACK_ID, MOTION_PACKS, setMotionPack } from '../../src/core/motion/motionPack.js';
import { transitions as sharedTransitions } from '../../src/core/utils/motion.js';

const pack = MOTION_PACKS[DEFAULT_MOTION_PACK_ID];

describe('useMotion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => setMotionPack(DEFAULT_MOTION_PACK_ID));

  it('在普通模式下透传参数，先取当前包的预设再取共用预设', () => {
    mocks.useReducedMotion.mockReturnValue(false);
    const { result } = renderHook(() => useMotion());

    expect(result.current.reduced).toBe(false);
    expect(result.current.pack).toBe(pack);
    expect(result.current.duration(0.3)).toBe(0.3);
    expect(result.current.ease([1, 2, 3])).toEqual([1, 2, 3]);
    expect(result.current.transition('enter')).toBe(pack.transitions.enter);
    expect(result.current.transition('enter', { delay: 0.3 })).toEqual({ ...pack.transitions.enter, delay: 0.3 });
    expect(result.current.transition('medium')).toBe(sharedTransitions.medium);
    expect(result.current.flow(0.25, { delay: 0.1 })).toEqual({ ...pack.flow(0.25), delay: 0.1 });
  });

  it('在 reduced motion 下清零动效', () => {
    mocks.useReducedMotion.mockReturnValue(true);
    const { result } = renderHook(() => useMotion());

    expect(result.current.reduced).toBe(true);
    expect(result.current.duration(0.3)).toBe(0);
    expect(result.current.ease([1, 2, 3])).toBe('linear');
    expect(result.current.transition('enter', { delay: 0.3 })).toMatchObject({ duration: 0, delay: 0 });
    expect(result.current.flow(0.25)).toEqual({ duration: 0 });
  });

  it('普通模式下手势配上当前包的按压过渡', () => {
    mocks.useReducedMotion.mockReturnValue(false);
    const { result } = renderHook(() => useMotion());

    expect(result.current.gesture('press')).toEqual({ ...pack.gestures.press, transition: pack.transitions.press });
    // 禁用时去掉手势目标，但保留 transition，按下后变禁用的按钮仍能复原
    expect(result.current.gesture('press', { disabled: true })).toEqual({ transition: pack.transitions.press });
    expect(result.current.variant('enter')).toBe(pack.variants.enter);
  });

  it('reduced motion 下关闭手势，入场只留终值、过渡瞬时', () => {
    mocks.useReducedMotion.mockReturnValue(true);
    const { result } = renderHook(() => useMotion());

    expect(result.current.gesture('portal')).toEqual({});
    expect(result.current.gesture('sink', { disabled: true })).toEqual({});
    const enter = result.current.variant('enter');
    expect(enter.hidden).toEqual({ opacity: 0 });
    expect(enter.visible).toEqual({ opacity: 1 });
    expect(enter.exit.opacity).toBe(0);
    expect(enter.exit.transition).toMatchObject({ duration: 0, delay: 0 });
    // 按参数生成的 variant（抽屉内容）同样去掉位移
    const edge = result.current.variant('edgeEnter');
    expect(edge.visible(12)).toEqual({ opacity: 1, transition: expect.objectContaining({ duration: 0, delay: 0 }) });
  });

  it('流式输出与特效时长以 CSS 变量给出，引用稳定；reduced motion 下为 null', () => {
    mocks.useReducedMotion.mockReturnValue(false);
    const { result, rerender } = renderHook(() => useMotion());
    const stream = result.current.stream();
    expect(stream).toEqual({
      '--we-stream-char-duration': `${Math.round(pack.stream.char * 1000)}ms`,
      '--we-stream-caret-duration': `${Math.round(pack.stream.caret * 1000)}ms`,
      '--we-stream-caret-out-duration': `${Math.round(pack.stream.caretOut * 1000)}ms`,
    });
    expect(result.current.fx()).toMatchObject({ '--we-fx-burst': `${Math.round(pack.fx.burst * 1000)}ms` });
    rerender();
    expect(result.current.stream()).toBe(stream);

    mocks.useReducedMotion.mockReturnValue(true);
    const { result: reduced } = renderHook(() => useMotion());
    expect(reduced.current.stream()).toBeNull();
    expect(reduced.current.fx()).toBeNull();
  });

  it('切包后已挂载的组件拿到新包', () => {
    mocks.useReducedMotion.mockReturnValue(false);
    const { result } = renderHook(() => useMotion());
    for (const next of Object.values(MOTION_PACKS)) {
      act(() => setMotionPack(next.id));
      expect(result.current.pack).toBe(next);
    }
  });
});
