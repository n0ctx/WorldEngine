import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../assistant/client/api.js', () => ({
  streamAgent: vi.fn(),
  resumeTask: vi.fn(),
  fetchTask: vi.fn(async () => null),
  recoverTask: vi.fn(async () => null),
  listRecoverableTasks: vi.fn(async () => []),
  cancelTask: vi.fn(),
  truncateFrom: vi.fn(),
  deleteMessage: vi.fn(),
}));
vi.mock('../../src/core/api/worlds.js', () => ({ getWorld: vi.fn() }));
vi.mock('../../src/core/api/characters.js', () => ({ getCharacter: vi.fn() }));
vi.mock('../../src/core/api/config.js', () => ({ getConfig: vi.fn() }));

import AssistantPanel from '../../../assistant/client/AssistantPanel.jsx';
import { useAssistantStore } from '../../../assistant/client/useAssistantStore.js';

describe('AssistantPanel 抽屉', () => {
  beforeEach(() => {
    act(() => useAssistantStore.setState({ isOpen: false, messages: [], taskId: null, status: 'idle', error: null }));
  });

  it('收起时不可交互，打开后输入框获焦，Esc 关闭并把焦点还给触发按钮', () => {
    render(
      <>
        <button type="button">打开写卡助手</button>
        <AssistantPanel />
      </>,
    );
    const drawer = screen.getByRole('complementary', { hidden: true });
    expect(drawer).toHaveAttribute('inert');

    const trigger = screen.getByRole('button', { name: '打开写卡助手' });
    trigger.focus();
    act(() => useAssistantStore.getState().open());

    expect(drawer).not.toHaveAttribute('inert');
    expect(document.activeElement).toBe(screen.getByLabelText('给写卡助手的消息'));

    fireEvent.keyDown(document.activeElement, { key: 'Escape' });

    expect(useAssistantStore.getState().isOpen).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });
});
