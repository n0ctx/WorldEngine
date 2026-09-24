import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useEscapeKey } from '../../src/core/hooks/useEscapeKey.js';

function Layer({ onEscape, enabled, children }) {
  useEscapeKey(onEscape, enabled);
  return children ?? null;
}

describe('useEscapeKey', () => {
  it('叠放时只关闭最上层，上层卸载后下层恢复响应', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const { rerender } = render(<Layer onEscape={outer}><Layer onEscape={inner} /></Layer>);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();

    rerender(<Layer onEscape={outer} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it('输入法选字中、已被内部控件消费或未启用时不触发', () => {
    const onEscape = vi.fn();
    const { rerender } = render(<Layer onEscape={onEscape} />);

    fireEvent.keyDown(window, { key: 'Escape', isComposing: true });
    const consumed = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    consumed.preventDefault();
    window.dispatchEvent(consumed);
    expect(onEscape).not.toHaveBeenCalled();

    rerender(<Layer onEscape={onEscape} enabled={false} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onEscape).not.toHaveBeenCalled();
  });
});
