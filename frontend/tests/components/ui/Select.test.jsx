import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Select from '../../../src/components/ui/Select.jsx';
import { useClickOutside } from '../../../src/core/hooks/useClickOutside.js';

const OPTIONS = [
  { value: '', label: '—' },
  { value: 'a', label: '练气初期' },
  { value: 'b', label: '筑基初期' },
  { value: 'c', label: '筑基中期' },
];

function Boundary({ onOutside, children }) {
  const ref = React.useRef(null);
  useClickOutside(ref, onOutside);
  return <div ref={ref}>{children}</div>;
}

describe('Select', () => {
  it('列表挂在 body 上，不在触发框所在的容器里', () => {
    const { container } = render(<Select value="a" onChange={() => {}} options={OPTIONS} />);
    fireEvent.click(screen.getByRole('button'));

    const list = screen.getByRole('listbox');
    expect(container.contains(list)).toBe(false);
    expect(document.body.contains(list)).toBe(true);
    expect(screen.getByRole('option', { name: '练气初期' })).toHaveAttribute('aria-selected', 'true');
  });

  it('点选项会选中，且不会被外层当成"点在外面"', () => {
    const onChange = vi.fn();
    const onOutside = vi.fn();
    render(
      <Boundary onOutside={onOutside}>
        <Select value="a" onChange={onChange} options={OPTIONS} />
      </Boundary>,
    );
    fireEvent.click(screen.getByRole('button'));
    fireEvent.mouseDown(screen.getByRole('option', { name: '筑基中期' }));

    expect(onChange).toHaveBeenCalledWith('c');
    expect(onOutside).not.toHaveBeenCalled();
  });

  it('键盘：↓ 展开并把焦点移进列表，从当前值开始移动，Enter 选中后焦点回到按钮', () => {
    const onChange = vi.fn();
    render(<Select value="a" onChange={onChange} options={OPTIONS} />);
    const trigger = screen.getByRole('button');

    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const list = screen.getByRole('listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(list).toHaveFocus();
    expect(list.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: '练气初期' }).id);

    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('b');
    expect(trigger).toHaveFocus();
  });

  it('autoOpen 挂载即展开；Esc 收起并通知调用方，不冒泡给外层', () => {
    const onEscape = vi.fn();
    const outerKey = vi.fn();
    render(
      <div onKeyDown={outerKey}>
        <Select value="" onChange={() => {}} options={OPTIONS} autoOpen onEscape={onEscape} />
      </div>,
    );
    const trigger = screen.getByRole('button');
    const list = screen.getByRole('listbox');
    expect(list).toHaveFocus();

    fireEvent.keyDown(list, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(outerKey).not.toHaveBeenCalled();
  });
});
