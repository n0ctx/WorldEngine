import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyRules: vi.fn((text) => text),
  logError: vi.fn(),
}));

vi.mock('../../src/utils/regex-runner.js', () => ({
  applyRules: (...args) => mocks.applyRules(...args),
}));
vi.mock('../../src/utils/logger.js', () => ({
  log: {
    error: (...args) => mocks.logError(...args),
  },
}));

import InputBox from '../../src/components/chat/InputBox.jsx';

describe('InputBox', () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.applyRules.mockReset();
    mocks.applyRules.mockImplementation((text) => text);
    mocks.logError.mockReset();
  });

  it('fillText 默认不会覆盖已有输入，force 时才覆盖', () => {
    const ref = React.createRef();
    render(
      <InputBox
        ref={ref}
        onSend={vi.fn()}
        onStop={vi.fn()}
        generating={false}
        impersonating={false}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('发送消息… (Shift+Enter 换行，/ 调出命令)'), {
      target: { value: '已有内容' },
    });

    expect(ref.current.fillText('代拟内容')).toBe(false);
    expect(screen.getByDisplayValue('已有内容')).toBeInTheDocument();

    act(() => {
      ref.current.fillText('代拟内容', { force: true });
    });
    expect(screen.getByDisplayValue('代拟内容')).toBeInTheDocument();
  });

  it('规则处理后为空时不会发送', () => {
    const onSend = vi.fn();
    mocks.applyRules.mockReturnValueOnce('   ');
    render(
      <InputBox
        onSend={onSend}
        onStop={vi.fn()}
        generating={false}
        impersonating={false}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('发送消息… (Shift+Enter 换行，/ 调出命令)'), {
      target: { value: '原始文本' },
    });
    fireEvent.click(screen.getByLabelText('发送消息'));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('附件读取失败时会提示并跳过文件', async () => {
    const file = new File(['bad'], 'broken.png', { type: 'image/png' });
    const FileReaderMock = class {
      readAsDataURL() {
        this.onerror?.(new Error('broken'));
      }
    };
    vi.stubGlobal('FileReader', FileReaderMock);

    render(
      <InputBox
        onSend={vi.fn()}
        onStop={vi.fn()}
        generating={false}
        impersonating={false}
      />,
    );

    const input = document.querySelector('input[type="file"]');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
      await Promise.resolve();
    });

    expect(mocks.logError).toHaveBeenCalledWith(
      'chat.image.read_failed',
      null,
      expect.objectContaining({ toast: expect.stringContaining('broken.png') }),
    );
  });
});
