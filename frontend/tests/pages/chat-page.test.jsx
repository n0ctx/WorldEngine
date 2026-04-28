import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import useStore from '../../src/store/index.js';

const mocks = vi.hoisted(() => {
  function createMessageListMock() {
    return {
      appendMessage: vi.fn(),
      updateMessages: vi.fn(),
      messagesRef: { current: [] },
    };
  }

  const SessionListPanelMock = () => <div data-testid="session-list" />;
  SessionListPanelMock.addSession = vi.fn();
  SessionListPanelMock.updateTitle = vi.fn();

  return {
    useParams: vi.fn(),
    createSession: vi.fn(),
    getSession: vi.fn(),
    sendMessage: vi.fn(),
    continueGeneration: vi.fn(),
    getCharacter: vi.fn(),
    getPersona: vi.fn(),
    getWorld: vi.fn(),
    loadRules: vi.fn(),
    MessageListState: createMessageListMock(),
    SessionListPanelMock,
  };
});

vi.mock('react-router-dom', () => ({
  useParams: () => mocks.useParams(),
}));
vi.mock('../../src/api/characters.js', () => ({ getCharacter: (...args) => mocks.getCharacter(...args) }));
vi.mock('../../src/api/personas.js', () => ({ getPersona: (...args) => mocks.getPersona(...args) }));
vi.mock('../../src/api/worlds.js', () => ({ getWorld: (...args) => mocks.getWorld(...args) }));
vi.mock('../../src/api/config.js', () => ({ getConfig: vi.fn(async () => ({ ui: {}, llm: {} })) }));
vi.mock('../../src/api/chat.js', () => ({
  sendMessage: (...args) => mocks.sendMessage(...args),
  stopGeneration: vi.fn(),
  regenerate: vi.fn(),
  editAndRegenerate: vi.fn(),
  continueGeneration: (...args) => mocks.continueGeneration(...args),
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
vi.mock('../../src/components/chat/MessageList.jsx', () => ({
  default: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      appendMessage: mocks.MessageListState.appendMessage,
      updateMessages: mocks.MessageListState.updateMessages,
      messagesRef: mocks.MessageListState.messagesRef,
    }));
    return (
      <div data-testid="message-list">
        <div data-testid="session-id">{props.sessionId || 'none'}</div>
        <div data-testid="world-id">{props.worldId || 'none'}</div>
      </div>
    );
  }),
}));
vi.mock('../../src/components/book/SessionListPanel.jsx', () => ({ default: mocks.SessionListPanelMock }));
vi.mock('../../src/components/chat/InputBox.jsx', () => ({
  default: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ fillText: vi.fn() }));
    return (
      <>
        <button onClick={() => props.onSend('测试消息', [])}>send</button>
        <button onClick={() => props.onContinue?.()}>continue</button>
      </>
    );
  }),
}));
vi.mock('../../src/components/book/BookSpread.jsx', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../src/components/book/PageLeft.jsx', () => ({
  default: ({ children, memoryWriting }) => (
    <div data-testid="left-page">
      {memoryWriting ? 'memory-writing' : 'memory-idle'}
      {children}
    </div>
  ),
}));
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
    mocks.MessageListState.appendMessage.mockReset();
    mocks.MessageListState.updateMessages.mockReset();
    mocks.MessageListState.messagesRef.current = [];
    mocks.SessionListPanelMock.addSession.mockReset();
    mocks.continueGeneration.mockReset();
    mocks.sendMessage.mockReset();
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

  afterEach(() => {
    vi.useRealTimers();
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
      expect.any(Object),
    ));
    expect(mocks.MessageListState.appendMessage).toHaveBeenCalled();
    expect(screen.getByTestId('state-panel')).toHaveTextContent('world-1');
  });

  it('continue 在 onStreamEnd 前不会允许重复触发', async () => {
    const callbacksRef = { current: null };
    mocks.getSession.mockResolvedValue({ id: 'session-1', title: '会话', character_id: 'char-1' });
    useStore.setState({
      currentWorldId: null,
      currentCharacterId: 'char-1',
      currentSessionId: 'session-1',
      memoryRefreshTick: 0,
    });
    mocks.MessageListState.messagesRef.current = [
      { id: 'asst-1', role: 'assistant', content: '第一段' },
    ];
    mocks.continueGeneration.mockImplementation((_sid, callbacks) => {
      callbacksRef.current = callbacks;
      return vi.fn();
    });

    render(<ChatPage />);

    await waitFor(() => expect(mocks.getCharacter).toHaveBeenCalledWith('char-1'));

    fireEvent.click(screen.getByText('continue'));
    await waitFor(() => expect(mocks.continueGeneration).toHaveBeenCalledTimes(1));

    await act(async () => {
      callbacksRef.current.onDone?.();
    });
    fireEvent.click(screen.getByText('continue'));
    expect(mocks.continueGeneration).toHaveBeenCalledTimes(1);

    await act(async () => {
      callbacksRef.current.onStreamEnd?.();
    });
    fireEvent.click(screen.getByText('continue'));
    await waitFor(() => expect(mocks.continueGeneration).toHaveBeenCalledTimes(2));
  });

  it('continue 收尾时使用后端最终 assistant 内容，避免 next_prompt 进入消息渲染', async () => {
    const callbacksRef = { current: null };
    mocks.getSession.mockResolvedValue({ id: 'session-1', title: '会话', character_id: 'char-1' });
    useStore.setState({
      currentWorldId: null,
      currentCharacterId: 'char-1',
      currentSessionId: 'session-1',
      memoryRefreshTick: 0,
    });
    mocks.MessageListState.messagesRef.current = [
      { id: 'asst-1', role: 'assistant', content: '第一段' },
    ];
    mocks.continueGeneration.mockImplementation((_sid, callbacks) => {
      callbacksRef.current = callbacks;
      return vi.fn();
    });

    render(<ChatPage />);

    await waitFor(() => expect(mocks.getCharacter).toHaveBeenCalledWith('char-1'));
    fireEvent.click(screen.getByText('continue'));

    await act(async () => {
      callbacksRef.current.onDelta?.('第二段<next_prompt>\n选项一');
      callbacksRef.current.onDone?.({ id: 'asst-1', role: 'assistant', content: '第一段\n\n第二段' }, ['选项一']);
      callbacksRef.current.onStreamEnd?.();
    });

    const updater = mocks.MessageListState.updateMessages.mock.calls.at(-1)[0];
    const updated = updater([{ id: 'asst-1', role: 'assistant', content: '第一段' }]);
    expect(updated[0].content).toBe('第一段\n\n第二段');
  });

  it('旧普通流 onStreamEnd 不会解锁正在进行的新流', async () => {
    const callbacks = [];
    mocks.getSession.mockResolvedValue({ id: 'session-1', title: '会话', character_id: 'char-1' });
    useStore.setState({
      currentWorldId: null,
      currentCharacterId: 'char-1',
      currentSessionId: 'session-1',
      memoryRefreshTick: 0,
    });
    mocks.sendMessage.mockImplementation((_sid, _content, _attachments, cb) => {
      callbacks.push(cb);
      return vi.fn();
    });

    render(<ChatPage />);

    await waitFor(() => expect(mocks.getCharacter).toHaveBeenCalledWith('char-1'));

    fireEvent.click(screen.getByText('send'));
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));

    await act(async () => {
      callbacks[0].onDone?.({ id: 'asst-1', content: '第一轮' }, []);
    });
    fireEvent.click(screen.getByText('send'));
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(2));

    await act(async () => {
      callbacks[0].onStreamEnd?.();
    });
    fireEvent.click(screen.getByText('send'));
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);

    await act(async () => {
      callbacks[1].onStreamEnd?.();
    });
    fireEvent.click(screen.getByText('send'));
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(3));
  });

  it('旧普通流 state_updated 会收起旧轮记忆记录提示，但不会解锁新流', async () => {
    const callbacks = [];
    mocks.getSession.mockResolvedValue({ id: 'session-1', title: '会话', character_id: 'char-1' });
    useStore.setState({
      currentWorldId: null,
      currentCharacterId: 'char-1',
      currentSessionId: 'session-1',
      memoryRefreshTick: 0,
    });
    mocks.sendMessage.mockImplementation((_sid, _content, _attachments, cb) => {
      callbacks.push(cb);
      return vi.fn();
    });

    render(<ChatPage />);

    await waitFor(() => expect(mocks.getCharacter).toHaveBeenCalledWith('char-1'));

    fireEvent.click(screen.getByText('send'));
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));

    await act(async () => {
      callbacks[0].onDone?.({ id: 'asst-1', content: '第一轮' }, []);
    });
    expect(screen.getByTestId('left-page')).toHaveTextContent('memory-writing');

    fireEvent.click(screen.getByText('send'));
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);

    vi.useFakeTimers();
    act(() => {
      callbacks[0].onStateUpdated?.();
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByTestId('left-page')).toHaveTextContent('memory-idle');

    fireEvent.click(screen.getByText('send'));
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
  });
});
