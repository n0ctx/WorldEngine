import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteTrigger: vi.fn(),
  updateTrigger: vi.fn(),
}));

vi.mock('../../../src/api/triggers', () => ({
  deleteTrigger: (...args) => mocks.deleteTrigger(...args),
  updateTrigger: (...args) => mocks.updateTrigger(...args),
}));

import TriggerCard from '../../../src/components/state/TriggerCard.jsx';

const baseTrigger = {
  id: 'trigger-1',
  name: '测试触发器',
  enabled: 1,
  one_shot: 0,
  last_triggered_round: null,
  conditions: [{ target_field: 'hp', operator: '<', value: '50' }],
  actions: [{ action_type: 'notify', params: { text: '血量低' } }],
};

describe('TriggerCard', () => {
  let onEdit, onDelete, onToggle;

  beforeEach(() => {
    onEdit = vi.fn();
    onDelete = vi.fn();
    onToggle = vi.fn();
    mocks.deleteTrigger.mockReset();
    mocks.updateTrigger.mockReset();
    global.alert = vi.fn();
  });

  it('默认状态：渲染触发器名称和操作按钮，无确认弹窗', () => {
    render(<TriggerCard trigger={baseTrigger} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} />);
    expect(screen.getByText('测试触发器')).toBeInTheDocument();
    expect(screen.getByText('编辑')).toBeInTheDocument();
    expect(screen.getByText('删除')).toBeInTheDocument();
    expect(screen.queryByText('删除触发器')).not.toBeInTheDocument();
  });

  it('点击删除按钮后弹出确认弹窗', () => {
    render(<TriggerCard trigger={baseTrigger} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} />);
    fireEvent.click(screen.getByText('删除'));
    expect(screen.getByText('删除触发器')).toBeInTheDocument();
    expect(screen.getByText(/确认删除触发器/)).toBeInTheDocument();
  });

  it('确认弹窗中可以点击取消关闭弹窗', () => {
    render(<TriggerCard trigger={baseTrigger} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} />);
    fireEvent.click(screen.getByText('删除'));
    expect(screen.getByText('删除触发器')).toBeInTheDocument();
    fireEvent.click(screen.getByText('取消'));
    expect(screen.queryByText('删除触发器')).not.toBeInTheDocument();
  });

  it('确认删除后调用 deleteTrigger 并触发 onDelete', async () => {
    mocks.deleteTrigger.mockResolvedValue({});
    render(<TriggerCard trigger={baseTrigger} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} />);
    fireEvent.click(screen.getByText('删除'));
    fireEvent.click(screen.getAllByText('删除')[1]);
    await waitFor(() => expect(mocks.deleteTrigger).toHaveBeenCalledWith('trigger-1'));
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  it('删除失败时弹出 alert 提示', async () => {
    mocks.deleteTrigger.mockRejectedValue(new Error('网络错误'));
    render(<TriggerCard trigger={baseTrigger} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} />);
    fireEvent.click(screen.getByText('删除'));
    fireEvent.click(screen.getAllByText('删除')[1]);
    await waitFor(() => expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('删除失败')));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('默认状态快照', () => {
    const { container } = render(
      <TriggerCard trigger={baseTrigger} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} />
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
