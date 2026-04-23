import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteWorldEntry: vi.fn(),
}));

vi.mock('../../../src/api/prompt-entries', () => ({
  deleteWorldEntry: (...args) => mocks.deleteWorldEntry(...args),
}));

// EntryEditor 是复杂子组件，mock 掉
vi.mock('../../../src/components/state/EntryEditor', () => ({
  default: ({ onClose }) => (
    <div>
      <span>条目编辑器</span>
      <button onClick={onClose}>关闭编辑器</button>
    </div>
  ),
}));

import EntrySection from '../../../src/components/state/EntrySection.jsx';

const baseEntries = [
  { id: 'entry-1', title: '世界观设定', position: 'system', keywords: [] },
  { id: 'entry-2', title: '后置规则', position: 'post', keywords: ['战斗'] },
];

describe('EntrySection', () => {
  let onRefresh;

  beforeEach(() => {
    onRefresh = vi.fn();
    mocks.deleteWorldEntry.mockReset();
    global.alert = vi.fn();
  });

  it('默认状态：渲染条目列表和按钮，无确认弹窗', () => {
    render(
      <EntrySection
        title="常驻条目"
        icon="📌"
        desc="始终注入"
        triggerType="always"
        entries={baseEntries}
        worldId="world-1"
        onRefresh={onRefresh}
      />
    );
    expect(screen.getByText('世界观设定')).toBeInTheDocument();
    expect(screen.getByText('后置规则')).toBeInTheDocument();
    expect(screen.queryByText('删除条目')).not.toBeInTheDocument();
  });

  it('点击删除按钮后弹出确认弹窗', () => {
    render(
      <EntrySection
        title="常驻条目"
        icon="📌"
        desc="始终注入"
        triggerType="always"
        entries={baseEntries}
        worldId="world-1"
        onRefresh={onRefresh}
      />
    );
    // 点击第一个条目的删除按钮
    const deleteButtons = screen.getAllByText('删除');
    fireEvent.click(deleteButtons[0]);
    expect(screen.getByText('删除条目')).toBeInTheDocument();
    expect(screen.getByText(/确认删除条目/)).toBeInTheDocument();
  });

  it('确认弹窗中可以点击取消关闭弹窗', () => {
    render(
      <EntrySection
        title="常驻条目"
        icon="📌"
        desc="始终注入"
        triggerType="always"
        entries={baseEntries}
        worldId="world-1"
        onRefresh={onRefresh}
      />
    );
    const deleteButtons = screen.getAllByText('删除');
    fireEvent.click(deleteButtons[0]);
    expect(screen.getByText('删除条目')).toBeInTheDocument();
    fireEvent.click(screen.getByText('取消'));
    expect(screen.queryByText('删除条目')).not.toBeInTheDocument();
  });

  it('确认删除后调用 deleteWorldEntry 并触发 onRefresh', async () => {
    mocks.deleteWorldEntry.mockResolvedValue({});
    render(
      <EntrySection
        title="常驻条目"
        icon="📌"
        desc="始终注入"
        triggerType="always"
        entries={baseEntries}
        worldId="world-1"
        onRefresh={onRefresh}
      />
    );
    const deleteButtons = screen.getAllByText('删除');
    fireEvent.click(deleteButtons[0]);
    // 条目列表中有 2 个删除按钮，模态弹窗的确认按钮排在第 3 位
    const allDeleteBtns = screen.getAllByText('删除');
    fireEvent.click(allDeleteBtns[allDeleteBtns.length - 1]);
    await waitFor(() => expect(mocks.deleteWorldEntry).toHaveBeenCalledWith('entry-1'));
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('删除失败时弹出 alert 提示', async () => {
    mocks.deleteWorldEntry.mockRejectedValue(new Error('服务器错误'));
    render(
      <EntrySection
        title="常驻条目"
        icon="📌"
        desc="始终注入"
        triggerType="always"
        entries={baseEntries}
        worldId="world-1"
        onRefresh={onRefresh}
      />
    );
    const deleteButtons = screen.getAllByText('删除');
    fireEvent.click(deleteButtons[0]);
    // 条目列表中有 2 个删除按钮，模态弹窗的确认按钮排在第 3 位
    const allDeleteBtns = screen.getAllByText('删除');
    fireEvent.click(allDeleteBtns[allDeleteBtns.length - 1]);
    await waitFor(() => expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('删除失败')));
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
