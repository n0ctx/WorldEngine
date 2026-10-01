import { fireEvent, render, screen, within } from '@testing-library/react';
import { AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import Button from '../../../src/components/ui/Button.jsx';
import ConfirmModal from '../../../src/components/ui/ConfirmModal.jsx';
import Dialog from '../../../src/components/ui/Dialog.jsx';

function Harness({ open }) {
  return (
    <AnimatePresence>
      {open && (
        <ConfirmModal title="删除世界？" message="无法恢复。" onConfirm={vi.fn()} onClose={vi.fn()} />
      )}
    </AnimatePresence>
  );
}

// 打开按钮 → 编辑弹窗（取消时叠出放弃确认）
function Editor({ onClose = vi.fn(), busy = false }) {
  const [open, setOpen] = useState(false);
  const [discard, setDiscard] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>打开</button>
      <AnimatePresence>
        {open && (
          <Dialog
            title="编辑规则"
            description="说明文字"
            busy={busy}
            onClose={() => { onClose(); setOpen(false); }}
            footer={(
              <>
                <Button variant="ghost" onClick={() => setDiscard(true)}>取消</Button>
                <Button onClick={() => setOpen(false)}>保存</Button>
              </>
            )}
          >
            <input aria-label="规则名" />
          </Dialog>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {discard && (
          <ConfirmModal title="放弃修改？" message="会丢失。" onConfirm={vi.fn()} onClose={() => setDiscard(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

describe('Dialog', () => {
  it('ConfirmModal 是模态确认框，标题与正文作为名称与描述，没有关闭键', () => {
    render(<Harness open />);
    const dialog = screen.getByRole('alertdialog', { name: '删除世界？' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('无法恢复。');
    expect(within(dialog).queryByRole('button', { name: '关闭' })).toBeNull();
  });

  it('ConfirmModal 关闭时先播退场再卸载', async () => {
    const { rerender } = render(<Harness open />);
    rerender(<Harness open={false} />);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('焦点落进弹窗，Tab 在首尾循环，关闭后还给打开它的按钮', async () => {
    render(<Editor />);
    const opener = screen.getByRole('button', { name: '打开' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: '编辑规则' });
    expect(dialog).toHaveAccessibleDescription('说明文字');
    expect(document.activeElement).toBe(dialog);

    const close = within(dialog).getByRole('button', { name: '关闭' });
    const save = within(dialog).getByRole('button', { name: '保存' });
    save.focus();
    fireEvent.keyDown(save, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(save);

    fireEvent.click(close);
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it('点空白处关闭；在面板里按下、拖到空白处松开不关闭', () => {
    const onClose = vi.fn();
    render(<Editor onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '打开' }));
    const backdrop = screen.getByRole('dialog').parentElement;
    fireEvent.mouseDown(screen.getByRole('textbox', { name: '规则名' }));
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('处理中时 Esc、点空白、关闭键都不关闭', () => {
    const onClose = vi.fn();
    render(<Editor onClose={onClose} busy />);
    fireEvent.click(screen.getByRole('button', { name: '打开' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.mouseDown(dialog.parentElement);
    fireEvent.click(dialog.parentElement);
    expect(within(dialog).getByRole('button', { name: '关闭' })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('嵌套弹窗叠在上面，Esc 只关最上层', async () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole('button', { name: '打开' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' }));
    const nested = screen.getByRole('alertdialog', { name: '放弃修改？' });
    expect(nested.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByRole('dialog', { name: '编辑规则' })).toBeInTheDocument();
  });
});
