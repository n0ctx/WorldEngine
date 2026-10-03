import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { getMotionPack } from '../../src/core/motion/motionPack.js';
import SaveCapsule from '../../src/pages/layout/SaveCapsule.jsx';

const base = { dirty: false, saving: false, error: '', savedKey: 0, saveLabel: '保存', onSave: vi.fn() };

describe('SaveCapsule', () => {
  it('没有改动时收起，有改动时浮起并由按钮保存', () => {
    const onSave = vi.fn();
    const { rerender } = render(<SaveCapsule {...base} onSave={onSave} />);
    expect(screen.queryByRole('status')).toBeNull();

    rerender(<SaveCapsule {...base} dirty onSave={onSave} />);
    expect(screen.getByText('有未保存的修改')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('新建时始终浮起；保存中按钮禁用；失败时显示原因并改为重试', () => {
    const { rerender } = render(<SaveCapsule {...base} creating saveLabel="创建世界" />);
    expect(screen.getByText('填写完成后创建')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '创建世界' })).toBeEnabled();

    rerender(<SaveCapsule {...base} dirty saving />);
    expect(screen.getByText('保存中…')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();

    rerender(<SaveCapsule {...base} dirty error="网络中断" />);
    expect(screen.getByText('保存失败：网络中断')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeEnabled();
  });

  it('保存成功后显示「已保存」，停一拍再收起', async () => {
    const { rerender } = render(<SaveCapsule {...base} dirty />);
    rerender(<SaveCapsule {...base} savedKey={1} />);
    expect(screen.getAllByText('已保存').length).toBeGreaterThan(0);

    const holdMs = getMotionPack().fx.stamp * 1000;
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull(), { timeout: holdMs + 2000 });
  });
});
