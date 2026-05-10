import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';

// Mock framer-motion: skip animations so AnimatePresence doesn't keep
// exiting nodes mounted under fake timers.
vi.mock('framer-motion', async () => {
  const React = await import('react');
  const MOTION_PROPS = new Set([
    'initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap',
    'variants', 'layout', 'layoutId', 'drag',
  ]);
  const passthrough = (tag) => React.forwardRef(function MotionTag(props, ref) {
    const rest = {};
    for (const k of Object.keys(props)) {
      if (!MOTION_PROPS.has(k)) rest[k] = props[k];
    }
    return React.createElement(tag, { ...rest, ref });
  });
  const motion = new Proxy({}, { get: (_t, key) => passthrough(key) });
  return {
    motion,
    AnimatePresence: ({ children }) => React.createElement(React.Fragment, null, children),
    useReducedMotion: () => false,
  };
});

const GlobalToast = (await import('../GlobalToast.jsx')).default;

function dispatch(detail) {
  window.dispatchEvent(new CustomEvent('we:toast', { detail }));
}

describe('GlobalToast 重写', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('error 显示 5 秒后消失', () => {
    render(<GlobalToast />);
    act(() => { dispatch({ message: 'oops', type: 'error' }); });
    expect(screen.getByText('oops')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(5100); });
    expect(screen.queryByText('oops')).toBeNull();
  });

  it('info 显示 3 秒后消失', () => {
    render(<GlobalToast />);
    act(() => { dispatch({ message: 'hello', type: 'info' }); });
    act(() => { vi.advanceTimersByTime(3100); });
    expect(screen.queryByText('hello')).toBeNull();
  });

  it('点击关闭键立刻消失', () => {
    render(<GlobalToast />);
    act(() => { dispatch({ message: 'bye', type: 'info' }); });
    const close = screen.getByLabelText('关闭通知');
    act(() => { fireEvent.click(close); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.queryByText('bye')).toBeNull();
  });

  it('MAX_TOASTS=3 超出剔除最旧', () => {
    render(<GlobalToast />);
    act(() => {
      dispatch({ message: 'a', type: 'info' });
      dispatch({ message: 'b', type: 'info' });
      dispatch({ message: 'c', type: 'info' });
      dispatch({ message: 'd', type: 'info' });
    });
    expect(screen.queryByText('a')).toBeNull();
    expect(screen.getByText('d')).toBeInTheDocument();
  });
});
