import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import useStore from '../../src/store/index.js';

const mocks = vi.hoisted(() => {
  function createMessageListMock() {
    const Component = (props) => (
      <div data-testid="message-list">
        <div data-testid="session-id">{props.sessionId || 'none'}</div>
        <div data-testid="world-id">{props.worldId || 'none'}</div>
      </div>
    );
    Component.appendMessage = vi.fn();
    Component.updateMessages = vi.fn();
    Component.messagesRef = { current: [] };
    return Component;
  }

  const SessionListPanelMock = () => <div data-testid="session-list" />;
  SessionListPanelMock.addSession = vi.fn();
  SessionListPanelMock.updateTitle = vi.fn();

  return {
    useParams: vi.fn(),
    createSession: vi.fn(),
    getSession: vi.fn(),
    sendMessage: vi.fn(),
    getCharacter: vi.fn(),
    getPersona: vi.fn(),
    getWorld: vi.fn(),
    loadRules: vi.fn(),
    MessageListMock: createMessageListMock(),
    SessionListPanelMock,
  };
});

vi.mock('react-router-dom', () => ({
  useParams: () => mocks.useParams(),
}));
vi.mock('../../src/api/characters.js', () => ({ getCharacter: (...args) => mocks.getCharacter(...args) }));
vi.mock('../../src/api/personas.js', () => ({ getPersona: (...args) => mocks.getPersona(...args) }));
vi.mock('../../src/api/worlds.js', () => ({ getWorld: (...args) => mocks.getWorld(...args) }));
vi.mock('../../src/api/chat.js', () => ({
  sendMessage: (...args) => mocks.sendMessage(...args),
  stopGeneration: vi.fn(),
  regenerate: vi.fn(),
  editAndRegenerate: vi.fn(),
  continueGeneration: vi.fn(),
  impersonate: vi.fn(),
  clearMessages: vi.fn(),
  editAssistantMessage: vi.fn(),
  retitle: vi.fn(),
}));
vi.mock('../../src/api/sessions.js', () => ({
  createSession: (...args) => mocks.createSession(...args),
  getSession: (...args) => mocks.getSession(...args),
  deleteMessage: vi.fn(),
}));
vi.mock('../../src/utils/regex-runner.js', () => ({ loadRules: (...args) => mocks.loadRules(...args) }));
vi.mock('../../src/utils/avatar.js', () => ({ getAvatarColor: () => '#000', getAvatarUrl: () => '' }));
vi.mock('../../src/components/chat/MessageList.jsx', () => ({ default: mocks.MessageListMock }));
vi.mock('../../src/components/book/SessionListPanel.jsx', () => ({ default: mocks.SessionListPanelMock }));
vi.mock('../../src/components/chat/InputBox.jsx', () => ({
  default: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ fillText: vi.fn() }));
    return <button onClick={() => props.onSend('测试消息', [])}>send</button>;
  }),
}));
vi.mock('../../src/components/book/BookSpread.jsx', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../src/components/book/PageLeft.jsx', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../src/components/book/PageRight.jsx', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../src/components/book/StatePanel.jsx', () => ({ default: (props) => <div data-testid="state-panel">{props.worldId}</div> }));
vi.mock('../../src/components/chat/OptionCard.jsx', () => ({ default: ({ options }) => <div>{options.join(',')}</div> }));

import ChatPage from '../../src/pages/ChatPage.jsx';

describe('ChatPage', () => {
  beforeEach(() => {
    mocks.useParams.mockReturnValue({ characterId: 'char-1' });
    useStore.setState({
      currentWorldId: null,
      currentCharacterId: null,
      currentSessionId: null,
      memoryRefreshTick: 0,
    });
    mocks.MessageListMock.appendMessage.mockReset();
    mocks.MessageListMock.updateMessages.mockReset();
    mocks.MessageListMock.messagesRef.current = [];
    mocks.SessionListPanelMock.addSession.mockReset();
    mocks.createSession.mockResolvedValue({ id: 'session-1', title: null, character_id: 'char-1' });
    mocks.getSession.mockResolvedValue(null);
    mocks.getCharacter.mockResolvedValue({ id: 'char-1', world_id: 'world-1', name: '阿塔' });
    mocks.getPersona.mockResolvedValue({ name: '旅者' });
    mocks.getWorld.mockResolvedValue({ id: 'world-1', name: '群星海' });
    mocks.loadRules.mockResolvedValue();
    mocks.sendMessage.mockImplementation((_sid, _content, _attachments, callbacks) => {
      callbacks.onUserSaved?.('user-1');
      callbacks.onDone?.({ id: 'asst-1', content: '你好' }, ['继续']);
      callbacks.onStreamEnd?.();
      return vi.fn();
    });
  });

  it('首次发送会自动建会话并调用 sendMessage', async () => {
    render(<ChatPage />);

    await waitFor(() => expect(mocks.getCharacter).toHaveBeenCalledWith('char-1'));
    fireEvent.click(screen.getByText('send'));

    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledWith('char-1'));
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith(
      'session-1',
      '测试消息',
      [],
      expect.any(Object),
    ));
    expect(mocks.MessageListMock.appendMessage).toHaveBeenCalled();
    expect(screen.getByTestId('state-panel')).toHaveTextContent('world-1');
  });
});
