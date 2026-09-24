import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import InputBox from '../InputBox.jsx';

function renderInputBox(props = {}) {
  return render(
    <InputBox
      onSend={vi.fn()}
      onStop={vi.fn()}
      generating={false}
      sessionId="s1"
      {...props}
    />,
  );
}

describe('InputBox', () => {
  afterEach(() => {
    cleanup();
    sessionStorage.clear();
  });

  it('工具条按钮可用键盘触发', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    renderInputBox({ onContinue });

    screen.getByRole('button', { name: '续写上一条 AI 回复' }).focus();
    await user.keyboard('{Enter}');

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('slash 菜单以 listbox 暴露给读屏，并随方向键更新当前项', async () => {
    const user = userEvent.setup();
    renderInputBox();
    const textarea = screen.getByRole('textbox', { name: '消息输入' });

    expect(textarea).toHaveAttribute('aria-expanded', 'false');
    await user.type(textarea, '/');

    const options = screen.getAllByRole('option');
    expect(textarea).toHaveAttribute('aria-expanded', 'true');
    expect(textarea).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
    expect(textarea).toHaveAttribute('aria-activedescendant', options[0].id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowDown}');
    expect(textarea).toHaveAttribute('aria-activedescendant', options[1].id);
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
  });
});
