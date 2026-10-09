import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ reduced: false }));

vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal()),
  useReducedMotion: () => mocks.reduced,
}));

import DeleteButton from '../../../src/components/motion/DeleteButton.jsx';
import SectionTabs from '../../../src/components/ui/SectionTabs.jsx';
import BounceRail from '../../../src/components/motion/BounceRail.jsx';
import TaskList from '../../../src/components/motion/TaskList.jsx';
import StepTrack from '../../../src/components/motion/StepTrack.jsx';
import CodeBlock from '../../../src/components/motion/CodeBlock.jsx';
import MotionOrb from '../../../src/components/motion/MotionOrb.jsx';
import { DEFAULT_MOTION_PACK_ID, setMotionPack } from '../../../src/core/motion/motionPack.js';

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

describe('SectionTabs 切换标记', () => {
  const sections = [
    { key: 'a', label: '基础', content: <p>基础内容</p> },
    { key: 'b', label: '模型', content: <p>模型内容</p> },
  ];

  it('刚挂载（如展开侧栏）不带切换标记，切换过页签后才带，动效包只在真正切换时强调当前页签', () => {
    const { container } = render(<SectionTabs sections={sections} defaultKey="a" />);
    const root = container.querySelector('.we-section-tabs');
    expect(root).not.toHaveClass('we-section-tabs--switched');

    fireEvent.click(screen.getByRole('tab', { name: '模型' }));
    expect(root).toHaveClass('we-section-tabs--switched');
  });

  it('切换页签只横向滚动页签行，不调用 scrollIntoView 连带滚动外层侧栏', () => {
    const scrollIntoView = vi.fn();
    const scrollTo = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const originalScrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollIntoView = scrollIntoView;
    Element.prototype.scrollTo = scrollTo;
    try {
      render(<SectionTabs sections={sections} defaultKey="a" />);
      const list = screen.getByRole('tablist');
      Object.defineProperty(list, 'clientWidth', { configurable: true, value: 100 });
      const tab = screen.getByRole('tab', { name: '模型' });
      Object.defineProperty(tab, 'offsetLeft', { configurable: true, value: 120 });
      Object.defineProperty(tab, 'offsetWidth', { configurable: true, value: 40 });

      fireEvent.click(tab);

      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(scrollTo).toHaveBeenCalledWith({ left: 60, behavior: 'smooth' });
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
      Element.prototype.scrollTo = originalScrollTo;
    }
  });
});

describe('SectionTabs 页签小图', () => {
  it('传了 icon 的页签在名字前放小图，读屏只读名字；没传的页签只有名字', () => {
    const sections = [
      { key: 'a', label: '艾拉', icon: <span data-testid="avatar">艾</span>, content: <p>艾拉内容</p> },
      { key: 'b', label: '日记', content: <p>日记内容</p> },
    ];
    render(<SectionTabs sections={sections} defaultKey="a" />);

    const withIcon = screen.getByRole('tab', { name: '艾拉' });
    expect(withIcon).toHaveClass('we-section-tab--icon');
    expect(screen.getByTestId('avatar').closest('.we-section-tab-icon')).toHaveAttribute('aria-hidden', 'true');
    const plain = screen.getByRole('tab', { name: '日记' });
    expect(plain).not.toHaveClass('we-section-tab--icon');
    expect(plain.innerHTML).toBe('日记');
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
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<CodeBlock code={'\n{\n  "a": 1\n}\n'} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '复制' }));
    });
    expect(writeText).toHaveBeenCalledWith('{\n  "a": 1\n}');
    expect(screen.getByRole('button', { name: '已复制' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'json 代码' })).toHaveTextContent('"a": 1');
  });
});

describe('MotionOrb 活字「检字」', () => {
  it('大尺寸的铅字上排着轮换的字，小尺寸只留铅块；整颗对读屏隐藏', () => {
    setMotionPack('letterpress');
    try {
      const { container, rerender } = render(<MotionOrb size={56} />);
      const orb = container.querySelector('.we-type-orb');
      expect(orb).toHaveAttribute('aria-hidden', 'true');
      expect(orb.querySelector('.we-type-orb__reel')).toHaveTextContent('世界书章');

      rerender(<MotionOrb size={16} />);
      expect(container.querySelector('.we-type-orb__slug')).toBeInTheDocument();
      expect(container.querySelector('.we-type-orb__reel')).toBeNull();
    } finally {
      setMotionPack(DEFAULT_MOTION_PACK_ID);
    }
  });
});

describe('MotionOrb 掷「骰子」', () => {
  it('大尺寸的骰子画点数，小尺寸只留骰身；整颗对读屏隐藏', () => {
    setMotionPack('dice');
    try {
      const { container, rerender } = render(<MotionOrb size={32} />);
      const orb = container.querySelector('.we-die-orb');
      expect(orb).toHaveAttribute('aria-hidden', 'true');
      expect(orb.querySelector('.we-die-orb__die')).toHaveClass('we-die-orb__die--pips');

      rerender(<MotionOrb size={16} />);
      expect(container.querySelector('.we-die-orb__die')).not.toHaveClass('we-die-orb__die--pips');
    } finally {
      setMotionPack(DEFAULT_MOTION_PACK_ID);
    }
  });
});
