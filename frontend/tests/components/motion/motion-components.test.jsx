import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ reduced: false }));

vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal()),
  useReducedMotion: () => mocks.reduced,
}));

import DeleteButton from '../../../src/components/motion/DeleteButton.jsx';
import AnimatedCounter from '../../../src/components/motion/AnimatedCounter.jsx';
import SectionTabs from '../../../src/components/ui/SectionTabs.jsx';
import BounceRail from '../../../src/components/motion/BounceRail.jsx';
import TaskList from '../../../src/components/motion/TaskList.jsx';
import StepTrack from '../../../src/components/motion/StepTrack.jsx';
import CodeBlock from '../../../src/components/motion/CodeBlock.jsx';

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

function BounceNav({ active }) {
  const ref = React.useRef(null);
  return (
    <nav ref={ref}>
      <BounceRail containerRef={ref} activeKey={active} />
      {['甲', '乙'].map((k) => (
        <button key={k} data-bounce-item aria-current={active === k ? 'page' : undefined}>{k}</button>
      ))}
    </nav>
  );
}

describe('BounceRail', () => {
  it('有当前项时显示圆点，没有当前项时隐藏，圆点对读屏隐藏', () => {
    const { container, rerender } = render(<BounceNav active="甲" />);
    const dot = container.querySelector('.we-bounce-rail');
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    expect(dot).toHaveClass('is-visible');

    rerender(<BounceNav active={null} />);
    expect(dot).not.toHaveClass('is-visible');
  });
});

describe('TaskList', () => {
  const tasksOf = (doneB, onClick = () => {}) => [
    { id: 'a', title: '第一步', done: false, onClick },
    { id: 'b', title: '第二步', done: doneB, onClick },
    { id: 'c', title: '第三步', done: false, onClick },
  ];
  const order = () => screen.getAllByRole('button').map((el) => el.textContent);

  it('一开始就完成的项排在最后；点击行交给调用方', () => {
    const onClick = vi.fn();
    render(<TaskList tasks={tasksOf(true, onClick)} />);
    expect(order()).toEqual(['第一步', '第三步', '第二步']);
    fireEvent.click(screen.getByRole('button', { name: '第一步' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('一项变为完成后划掉、沉底，并向读屏播报', async () => {
    mocks.reduced = true;
    const { rerender } = render(<TaskList tasks={tasksOf(false)} />);
    expect(order()).toEqual(['第一步', '第二步', '第三步']);

    rerender(<TaskList tasks={tasksOf(true)} />);
    await waitFor(() => expect(order()).toEqual(['第一步', '第三步', '第二步']));
    expect(screen.getByRole('button', { name: '第二步' })).toHaveAttribute('data-state', 'checked');
    expect(screen.getByRole('status')).toHaveTextContent('第二步 已完成');
  });
});

describe('StepTrack', () => {
  it('读屏读到当前是第几步', () => {
    render(<StepTrack steps={3} current={1} />);
    expect(screen.getByRole('img', { name: '第 2 / 3 步' })).toBeInTheDocument();
  });
});

describe('CodeBlock', () => {
  it('复制按钮把代码写进剪贴板，并切换成已复制', async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CodeBlock code={'\n{\n  "a": 1\n}\n'} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '复制' }));
    });
    expect(writeText).toHaveBeenCalledWith('{\n  "a": 1\n}');
    expect(screen.getByRole('button', { name: '已复制' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'json 代码' })).toHaveTextContent('"a": 1');
  });
});
