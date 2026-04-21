import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  function createMessageListMock() {
    const Component = (props) => <div data-testid="message-list">{props.sessionId || 'none'}</div>;
    Component.appendMessage = vi.fn();
    Component.updateMessages = vi.fn();
    Component.messagesRef = { current: [] };
    return Component;
  }

  const WritingSessionListMock = () => <div data-testid="session-list" />;
  WritingSessionListMock.addSession = vi.fn();
  WritingSessionListMock.updateTitle = vi.fn();

  return {
    useParams: vi.fn(),
    setAppMode: vi.fn(),
    refreshCustomCss: vi.fn(),
    getWorld: vi.fn(),
    getPersona: vi.fn(),
    listWritingSessions: vi.fn(),
    createWritingSession: vi.fn(),
    listActiveCharacters: vi.fn(),
    generate: vi.fn(),
    continueGeneration: vi.fn(),
    getChapterTitles: vi.fn(),
    MessageListMock: createMessageListMock(),
    WritingSessionListMock,
  };
});

vi.mock('react-router-dom', () => ({
  useParams: () => mocks.useParams(),
}));
vi.mock('../../src/store/appMode.js', () => ({
  useAppModeStore: (selector) => selector({ setAppMode: mocks.setAppMode }),
}));
vi.mock('../../src/api/custom-css-snippets.js', () => ({ refreshCustomCss: (...args) => mocks.refreshCustomCss(...args) }));
vi.mock('../../src/api/worlds.js', () => ({ getWorld: (...args) => mocks.getWorld(...args) }));
vi.mock('../../src/api/personas.js', () => ({ getPersona: (...args) => mocks.getPersona(...args) }));
vi.mock('../../src/api/writing-sessions.js', () => ({
  listWritingSessions: (...args) => mocks.listWritingSessions(...args),
  createWritingSession: (...args) => mocks.createWritingSession(...args),
  listActiveCharacters: (...args) => mocks.listActiveCharacters(...args),
  generate: (...args) => mocks.generate(...args),
  stopGeneration: vi.fn(),
  continueGeneration: (...args) => mocks.continueGeneration(...args),
  regenerateWriting: vi.fn(),
  editAndRegenerateWriting: vi.fn(),
  editWritingAssistantMessage: vi.fn(),
  impersonateWriting: vi.fn(),
}));
vi.mock('../../src/api/sessions.js', () => ({ deleteMessage: vi.fn() }));
vi.mock('../../src/components/chat/MessageList.jsx', () => ({ default: mocks.MessageListMock }));
vi.mock('../../src/components/book/WritingPageLeft.jsx', () => ({ default: () => <div data-testid="left" /> }));
vi.mock('../../src/components/book/CastPanel.jsx', () => ({ default: () => <div data-testid="cast" /> }));
vi.mock('../../src/components/book/WritingSessionList.jsx', () => ({ default: mocks.WritingSessionListMock }));
vi.mock('../../src/components/chat/InputBox.jsx', () => ({
  default: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ fillText: vi.fn() }));
    return (
      <>
        <button onClick={() => props.onSend('写作消息')}>send-writing</button>
        <button onClick={() => props.onContinue?.()}>continue-writing</button>
      </>
    );
  }),
}));
vi.mock('../../src/components/chat/OptionCard.jsx', () => ({ default: ({ options }) => <div>{options.join(',')}</div> }));
vi.mock('../../src/api/chapter-titles.js', () => ({
  getChapterTitles: (...args) => mocks.getChapterTitles(...args),
  updateChapterTitle: vi.fn(),
}));

import WritingSpacePage from '../../src/pages/WritingSpacePage.jsx';

describe('WritingSpacePage', () => {
  beforeEach(() => {
    mocks.useParams.mockReturnValue({ worldId: 'world-1' });
    mocks.getWorld.mockResolvedValue({ id: 'world-1', name: '世界' });
    mocks.getPersona.mockResolvedValue({ name: '旅者' });
    mocks.listWritingSessions.mockResolvedValue([]);
    mocks.createWritingSession.mockResolvedValue({ id: 'ws-1', title: null });
    mocks.listActiveCharacters.mockResolvedValue([{ id: 'char-1', name: '阿塔' }]);
    mocks.continueGeneration.mockReset();
    mocks.getChapterTitles.mockResolvedValue([]);
    mocks.generate.mockImplementation((_wid, _sid, _content, callbacks) => {
      callbacks.onDone?.({ id: 'asst-1', content: '段落' }, ['下一步']);
      callbacks.onStreamEnd?.();
      return vi.fn();
    });
  });

  afterEach(() => {
    mocks.refreshCustomCss.mockReset();
  });

  it('首次进入会创建写作会话并切到 writing 模式，发送时调用 generate', async () => {
    const { unmount } = render(<WritingSpacePage />);

    await waitFor(() => expect(mocks.setAppMode).toHaveBeenCalledWith('writing'));
    expect(mocks.refreshCustomCss).toHaveBeenCalledWith('writing');
    await waitFor(() => expect(mocks.createWritingSession).toHaveBeenCalledWith('world-1'));

    fireEvent.click(screen.getByText('send-writing'));

    await waitFor(() => expect(mocks.generate).toHaveBeenCalledWith(
      'world-1',
      'ws-1',
      '写作消息',
      expect.any(Object),
      expect.any(Object),
    ));
    expect(screen.getByTestId('message-list')).toHaveTextContent('ws-1');

    unmount();
    expect(mocks.setAppMode).toHaveBeenCalledWith('chat');
    expect(mocks.refreshCustomCss).toHaveBeenCalledWith('chat');
  });

  it('writing continue 在 onStreamEnd 前不会允许重复触发', async () => {
    const callbacksRef = { current: null };
    mocks.listWritingSessions.mockResolvedValue([{ id: 'ws-1', title: '章节一' }]);
    mocks.continueGeneration.mockImplementation((_wid, _sid, callbacks) => {
      callbacksRef.current = callbacks;
      return vi.fn();
    });
    mocks.MessageListMock.messagesRef.current = [
      { id: 'asst-1', role: 'assistant', content: '第一段' },
    ];

    render(<WritingSpacePage />);

    await waitFor(() => expect(mocks.listWritingSessions).toHaveBeenCalledWith('world-1'));
    await waitFor(() => expect(mocks.listActiveCharacters).toHaveBeenCalledWith('world-1', 'ws-1'));
    await waitFor(() => expect(screen.getByTestId('message-list')).toHaveTextContent('ws-1'));

    fireEvent.click(screen.getByText('continue-writing'));
    await waitFor(() => expect(mocks.continueGeneration).toHaveBeenCalledTimes(1));

    await act(async () => {
      callbacksRef.current.onDone?.();
    });
    fireEvent.click(screen.getByText('continue-writing'));
    expect(mocks.continueGeneration).toHaveBeenCalledTimes(1);

    await act(async () => {
      callbacksRef.current.onStreamEnd?.();
    });
    fireEvent.click(screen.getByText('continue-writing'));
    await waitFor(() => expect(mocks.continueGeneration).toHaveBeenCalledTimes(2));
  });
});
