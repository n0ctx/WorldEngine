import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import WorldTabNav from '../../../src/components/blocks/WorldTabNav.jsx';

const TABS = [
  { key: '/worlds/1/build', label: '构建' },
  { key: '/worlds/1',       label: '故事' },
  { key: '/worlds/1/state', label: '状态' },
];

describe('WorldTabNav', () => {
  it('默认状态快照（无激活项）', () => {
    const { container } = render(
      <WorldTabNav tabs={TABS} activeTab="" onTabChange={vi.fn()} />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('tab1 激活状态快照', () => {
    const { container } = render(
      <WorldTabNav tabs={TABS} activeTab="/worlds/1/build" onTabChange={vi.fn()} />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('tab2 激活状态快照', () => {
    const { container } = render(
      <WorldTabNav tabs={TABS} activeTab="/worlds/1" onTabChange={vi.fn()} />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('激活项有 --active class，非激活项没有', () => {
    render(
      <WorldTabNav tabs={TABS} activeTab="/worlds/1/build" onTabChange={vi.fn()} />
    );
    const buildBtn = screen.getByText('构建');
    expect(buildBtn.className).toContain('we-tab-nav__item--active');
    const storyBtn = screen.getByText('故事');
    expect(storyBtn.className).not.toContain('we-tab-nav__item--active');
  });

  it('点击 tab 调用 onTabChange 并传入对应 key', () => {
    const onTabChange = vi.fn();
    render(
      <WorldTabNav tabs={TABS} activeTab="/worlds/1/build" onTabChange={onTabChange} />
    );
    fireEvent.click(screen.getByText('状态'));
    expect(onTabChange).toHaveBeenCalledWith('/worlds/1/state');
  });
});
