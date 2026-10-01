import { render, screen } from '@testing-library/react';
import { AnimatePresence } from 'framer-motion';
import { describe, expect, it, vi } from 'vitest';

import ConfirmModal from '../../../src/components/ui/ConfirmModal.jsx';
import ModalShell from '../../../src/components/ui/ModalShell.jsx';
import DialogShell from '../../../src/components/ui/DialogShell.jsx';

function Harness({ open }) {
  return (
    <AnimatePresence>
      {open && (
        <ConfirmModal title="删除世界？" message="无法恢复。" onConfirm={vi.fn()} onClose={vi.fn()} />
      )}
    </AnimatePresence>
  );
}

describe('弹层外壳', () => {
  it('ConfirmModal 声明为模态确认框，标题与正文作为名称与描述', () => {
    render(<Harness open />);
    const dialog = screen.getByRole('alertdialog', { name: '删除世界？' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('无法恢复。');
  });

  it('ConfirmModal 关闭时先播退场再卸载', async () => {
    const { rerender } = render(<Harness open />);
    rerender(<Harness open={false} />);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('ModalShell 与 DialogShell 声明为模态对话框', () => {
    render(
      <>
        <ModalShell onClose={vi.fn()}>甲</ModalShell>
        <DialogShell onClose={vi.fn()}>乙</DialogShell>
      </>,
    );
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs).toHaveLength(2);
    for (const d of dialogs) expect(d).toHaveAttribute('aria-modal', 'true');
  });
});
