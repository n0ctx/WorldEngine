import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ reduced: false }));

vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal()),
  useReducedMotion: () => mocks.reduced,
}));

import DeleteButton from '../../../src/components/motion/DeleteButton.jsx';
import AnimatedCounter from '../../../src/components/motion/AnimatedCounter.jsx';
import SectionTabs from '../../../src/components/ui/SectionTabs.jsx';

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  global.ResizeObserver = ResizeObserverMock;
  mocks.reduced = false;
});

describe('DeleteButton 原地确认', () => {
  it('第一次点击只展开确认，点「确认删除」才调用 onConfirm', () => {
    const onConfirm = vi.fn();
    render(<DeleteButton label="删除条目「甲」" onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: '删除条目「甲」' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '删除条目「甲」' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('展开后按 Esc 取消，不删除并通知 onCancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<DeleteButton onConfirm={onConfirm} onCancel={onCancel} />);

    const trigger = screen.getByRole('button', { name: '删除' });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'Escape' });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('放在可点击的行里时，点击与按键都不冒泡到行', () => {
    const onRowClick = vi.fn();
    const onRowKey = vi.fn();
    render(
      <div role="button" tabIndex={0} onClick={onRowClick} onKeyDown={onRowKey}>
        <DeleteButton onConfirm={() => {}} />
      </div>,
    );

    const trigger = screen.getByRole('button', { name: '删除' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(trigger);

    expect(onRowClick).not.toHaveBeenCalled();
    expect(onRowKey).not.toHaveBeenCalled();
  });

  it('减少动效时两步确认照常可用', () => {
    mocks.reduced = true;
    const onConfirm = vi.fn();
    render(<DeleteButton onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('AnimatedCounter', () => {
  it('读屏读到完整数值，滚轮本身对读屏隐藏', () => {
    const { container, rerender } = render(<p>共 <AnimatedCounter value={12} /> 个</p>);
    expect(container.querySelector('.we-visually-hidden')).toHaveTextContent('12');
    expect(container.querySelector('.we-counter__wheels')).toHaveAttribute('aria-hidden');

    rerender(<p>共 <AnimatedCounter value={105} /> 个</p>);
    expect(container.querySelector('.we-visually-hidden')).toHaveTextContent('105');
    expect(container.querySelectorAll('.we-counter__digit')).toHaveLength(3);
  });
});

describe('SectionTabs variant="gooey"', () => {
  const sections = [
    { key: 'a', label: '基础', content: <p>基础内容</p> },
    { key: 'b', label: '模型', content: <p>模型内容</p> },
    { key: 'c', label: '状态', content: <p>状态内容</p> },
  ];

  it('tab 仍是 tablist 里的 tab，方向键切换，不画下划线指示器', () => {
    const { container } = render(<SectionTabs sections={sections} defaultKey="a" variant="gooey" />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(container.querySelector('.we-section-tab-indicator')).toBeNull();
    expect(container.querySelectorAll('.we-gooey-nav__segment')).toHaveLength(3);

    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: '模型' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('模型内容')).toBeInTheDocument();
    expect(container.querySelector('.we-gooey-nav__segment.is-active')).toHaveTextContent('模型');
  });
});
