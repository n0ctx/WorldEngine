import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import useStore from '../../src/core/state/index.js';
import useSidePanelsStore from '../../src/core/state/sidePanels.js';

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
    navigate: vi.fn(),
    useParams: vi.fn(),
    createSession: vi.fn(),
    getSession: vi.fn(),
    sendMessage: vi.fn(),
    recoverChatStream: vi.fn(),
    subscribeChatStream: vi.fn(),
    continueGeneration: vi.fn(),
    stopGeneration: vi.fn(),
    regenerate: vi.fn(),
    editAndRegenerate: vi.fn(),
    impersonate: vi.fn(),
    clearMessages: vi.fn(),
    editAssistantMessage: vi.fn(),
    retitle: vi.fn(),
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
  useNavigate: () => mocks.navigate,
}));
vi.mock('../../src/core/api/characters.js', () => ({ getCharacter: (...args) => mocks.getCharacter(...args) }));
vi.mock('../../src/core/api/personas.js', () => ({ getPersona: (...args) => mocks.getPersona(...args) }));
vi.mock('../../src/core/api/worlds.js', () => ({ getWorld: (...args) => mocks.getWorld(...args) }));
vi.mock('../../src/core/api/world-state-fields.js', () => ({ syncDiaryTimeField: vi.fn(async () => ({})) }));
vi.mock('../../src/core/api/config.js', () => ({ getConfig: vi.fn(async () => ({ ui: {}, llm: {} })) }));
vi.mock('../../src/core/api/chat.js', () => ({
  sendMessage: (...args) => mocks.sendMessage(...args),
  recoverChatStream: (...args) => mocks.recoverChatStream(...args),
  subscribeChatStream: (...args) => mocks.subscribeChatStream(...args),
  stopGeneration: (...args) => mocks.stopGeneration(...args),
  regenerate: (...args) => mocks.regenerate(...args),
  editAndRegenerate: (...args) => mocks.editAndRegenerate(...args),
  continueGeneration: (...args) => mocks.continueGeneration(...args),
  impersonate: (...args) => mocks.impersonate(...args),
  clearMessages: (...args) => mocks.clearMessages(...args),
  editAssistantMessage: (...args) => mocks.editAssistantMessage(...args),
  retitle: (...args) => mocks.retitle(...args),
}));
vi.mock('../../src/core/api/sessions.js', () => ({
  createSession: (...args) => mocks.createSession(...args),
  getSession: (...args) => mocks.getSession(...args),
  deleteMessage: vi.fn(),
}));
vi.mock('../../src/core/utils/regex-runner.js', () => ({ loadRules: (...args) => mocks.loadRules(...args) }));
vi.mock('../../src/core/utils/avatar.js', () => ({ getAvatarColor: () => '#000', getAvatarUrl: () => '' }));
vi.mock('../../src/components/chat/MessageList.jsx', () => ({
  default: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      appendMessage: mocks.MessageListState.appendMessage,
      updateMessages: mocks.MessageListState.updateMessages,
      messagesRef: mocks.MessageListState.messagesRef,
    }));
    React.useEffect(() => {
      props.onMessagesLoaded?.(mocks.MessageListState.messagesRef.current ?? []);
    }, [props]);
    return (
      <div data-testid="message-list">
        <div data-testid="session-id">{props.sessionId || 'none'}</div>
        <div data-testid="world-id">{props.worldId || 'none'}</div>
        <div data-testid="options">{(props.options || []).join(',')}</div>
        <button onClick={() => props.onEditAssistantMessage?.('asst-1', '改写后的回复')}>edit-assistant</button>
        <button onClick={() => props.onDeleteMessage?.('msg-1')}>delete-message</button>
        <button onClick={() => props.onRegenerateMessage?.('asst-1')}>regenerate-message</button>
      </div>
    );
  }),
}));
vi.mock('../../src/components/session/WorldTimelinePanel.jsx', () => ({ default: mocks.SessionListPanelMock }));
vi.mock('../../src/components/chat/InputBox.jsx', () => ({
  default: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ fillText: vi.fn() }));
    return (
      <>
        <button onClick={() => props.onSend('测试消息', [])}>send</button>
        <button onClick={() => props.onContinue?.()}>continue</button>
        <button onClick={() => props.onImpersonate?.()}>impersonate</button>
        <button onClick={() => props.onClear?.()}>clear</button>
        <button onClick={() => props.onRetry?.()}>retry-last</button>
        <button onClick={() => props.onTitle?.()}>retitle</button>
        <button onClick={() => props.onStop?.()}>stop</button>
      </>
    );
  }),
}));
vi.mock('../../src/components/state/StatePanel.jsx', () => ({
  default: (props) => (
    <div data-testid="state-panel">
      {props.worldId}
      <button onClick={() => props.onDiaryInject?.('日记注入内容')}>inject-diary</button>
    </div>
  ),
}));
vi.mock('../../src/components/chat/OptionCard.jsx', () => ({ default: ({ options }) => <div>{options.join(',')}</div> }));

import { PageLayoutRendererProvider } from '../../src/pages/layout/PageLayout.jsx';
import renderPageLayout from '../../src/shells/book-spread/layout/pageLayoutRenderer.jsx';
import ChatPage from '../../src/pages/ChatPage/index.jsx';
import GlobalToast from '../../src/components/ui/GlobalToast.jsx';

const renderChatPage = () =>
  render(
    <PageLayoutRendererProvider render={renderPageLayout}>
      <ChatPage />
      <GlobalToast />
    </PageLayoutRendererProvider>,
  );

describe('ChatPage', () => {
  beforeEach(() => {
    mocks.useParams.mockReturnValue({ characterId: 'char-1' });
    useStore.setState({
      currentWorldId: null,
      currentCharacterId: null,
      currentSessionId: null,
      memoryRefreshTick: 0,
    });
    // 两侧抽屉是跨页面共享的全局 store，测试间要重置回默认收起态，
    // 否则前一个用例点开过的面板会带到下一个用例里。
    useSidePanelsStore.setState({ leftOpen: false, rightOpen: false });
    mocks.MessageListState.appendMessage.mockReset();
    mocks.MessageListState.updateMessages.mockReset();
    mocks.MessageListState.messagesRef.current = [];
    mocks.SessionListPanelMock.addSession.mockReset();
    mocks.continueGeneration.mockReset();
    mocks.recoverChatStream.mockReset();
    mocks.subscribeChatStream.mockReset();
    mocks.sendMessage.mockReset();
    mocks.stopGeneration.mockReset();
    mocks.regenerate.mockReset();
    mocks.editAndRegenerate.mockReset();
    mocks.impersonate.mockReset();
    mocks.clearMessages.mockReset();
    mocks.editAssistantMessage.mockReset();
    mocks.retitle.mockReset();
    mocks.createSession.mockResolvedValue({ id: 'session-1', title: null, character_id: 'char-1' });
    mocks.getSession.mockResolvedValue(null);
    mocks.getCharacter.mockResolvedValue({ id: 'char-1', world_id: 'world-1', name: '阿塔' });
    mocks.getPersona.mockResolvedValue({ name: '旅者' });
    mocks.getWorld.mockResolvedValue({ id: 'world-1', name: '群星海' });
    mocks.loadRules.mockResolvedValue();
    mocks.impersonate.mockResolvedValue({ content: '代拟内容' });
    mocks.clearMessages.mockResolvedValue({ firstMessage: '' });
    mocks.editAssistantMessage.mockResolvedValue({ ok: true });
    mocks.retitle.mockResolvedValue({ title: '新标题' });
    mocks.stopGeneration.mockResolvedValue({});
    mocks.recoverChatStream.mockResolvedValue(null);
    mocks.subscribeChatStream.mockImplementation(() => vi.fn());
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
    renderChatPage();

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
    // 状态面板默认收在右侧窄轨里，先展开再断言内容（第 10 步：两侧改为可收起抽屉）
    fireEvent.click(screen.getByRole('button', { name: '展开状态面板' }));
    expect(screen.getByTestId('state-panel')).toHaveTextContent('world-1');
  });

  it('会话栏收起时，对话列顶部仍可点「返回世界」', async () => {
    renderChatPage();
    await waitFor(() => expect(mocks.getCharacter).toHaveBeenCalledWith('char-1'));

    expect(screen.getByRole('button', { name: '展开会话列表' })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(await screen.findByRole('button', { name: '返回世界' }));

    expect(mocks.navigate).toHaveBeenCalledWith('/worlds/world-1');
  });

  it('两侧抽屉默认收起为窄轨，展开后才挂载内容，收起也能收回去（第 10 步核心行为）', async () => {
    renderChatPage();

    await waitFor(() => expect(mocks.getCharacter).toHaveBeenCalledWith('char-1'));

    const toggleLeft = screen.getByRole('button', { name: '展开会话列表' });
    const toggleRight = screen.getByRole('button', { name: '展开状态面板' });

    // 默认收起：切换按钮 aria-expanded=false，抽屉内容尚未挂载
    expect(toggleLeft).toHaveAttribute('aria-expanded', 'false');
    expect(toggleRight).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('session-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('state-panel')).not.toBeInTheDocument();

    // 展开后内容挂载，按钮文案与 aria-expanded 同步翻转
    fireEvent.click(toggleLeft);
    fireEvent.click(toggleRight);
    expect(screen.getByRole('button', { name: '收起会话列表' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: '收起状态面板' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('session-list')).toBeInTheDocument();
    expect(screen.getByTestId('state-panel')).toBeInTheDocument();

    // 再次收起，内容卸载
    fireEvent.click(screen.getByRole('button', { name: '收起会话列表' }));
    fireEvent.click(screen.getByRole('button', { name: '收起状态面板' }));
    expect(screen.queryByTestId('session-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('state-panel')).not.toBeInTheDocument();
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

    renderChatPage();

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

    renderChatPage();

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

    renderChatPage();

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

  it('停止时后端回报无活动流（active=false）会本地断开悬挂连接并解锁输入', async () => {
    mocks.getSession.mockResolvedValue({ id: 'session-1', title: '会话', character_id: 'char-1' });
    useStore.setState({
      currentWorldId: null,
      currentCharacterId: 'char-1',
      currentSessionId: 'session-1',
      memoryRefreshTick: 0,
    });
    const aborts = [];
    mocks.sendMessage.mockImplementation((_sid, _content, _attachments, cb) => {
      // 模拟 streamPost：abort 后 finally 触发 onStreamEnd；不 abort 则连接永远悬挂
      const abort = vi.fn(() => cb.onStreamEnd?.());
      aborts.push(abort);
      return abort;
    });
    mocks.stopGeneration.mockResolvedValue({ success: true, active: false });

    renderChatPage();
    await waitFor(() => expect(mocks.getCharacter).toHaveBeenCalledWith('char-1'));

    fireEvent.click(screen.getByText('send'));
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText('send'));
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('stop'));
    await waitFor(() => expect(aborts[0]).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('send'));
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(2));
  });

  it('停止时后端仍有活动流（active=true）不本地断开，等待 aborted 事件', async () => {
    mocks.getSession.mockResolvedValue({ id: 'session-1', title: '会话', character_id: 'char-1' });
    useStore.setState({
      currentWorldId: null,
      currentCharacterId: 'char-1',
      currentSessionId: 'session-1',
      memoryRefreshTick: 0,
    });
    const abort = vi.fn();
    mocks.sendMessage.mockImplementation(() => abort);
    mocks.stopGeneration.mockResolvedValue({ success: true, active: true });

    renderChatPage();
    await waitFor(() => expect(mocks.getCharacter).toHaveBeenCalledWith('char-1'));

    fireEvent.click(screen.getByText('send'));
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText('stop'));
    await waitFor(() => expect(mocks.stopGeneration).toHaveBeenCalledWith('session-1'));
    await act(async () => {});
    expect(abort).not.toHaveBeenCalled();
  });

  it('停止请求失败时弹出提示，不本地断开', async () => {
    mocks.getSession.mockResolvedValue({ id: 'session-1', title: '会话', character_id: 'char-1' });
    useStore.setState({
      currentWorldId: null,
      currentCharacterId: 'char-1',
      currentSessionId: 'session-1',
      memoryRefreshTick: 0,
    });
    const abort = vi.fn();
    mocks.sendMessage.mockImplementation(() => abort);
    mocks.stopGeneration.mockRejectedValue(new Error('Failed to fetch'));
    const toasts = [];
    const onToast = (e) => toasts.push(e.detail.message);
    window.addEventListener('we:toast', onToast);

    renderChatPage();
    await waitFor(() => expect(mocks.getCharacter).toHaveBeenCalledWith('char-1'));

    fireEvent.click(screen.getByText('send'));
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText('stop'));
    await waitFor(() => expect(toasts).toContain('停止失败，请重试：Failed to fetch'));
    window.removeEventListener('we:toast', onToast);
    expect(abort).not.toHaveBeenCalled();
  });

  it('进入已有 session 时会尝试恢复断点续传并补订阅', async () => {
    mocks.getSession.mockResolvedValue({ id: 'session-1', title: '会话', character_id: 'char-1' });
    mocks.recoverChatStream.mockResolvedValue({
      id: 'stream-1',
      sessionId: 'session-1',
      status: 'streaming',
      messages: [{ id: 'user-1', role: 'user', content: '上一句' }],
      streamingText: '恢复中的回复',
      continuingMessageId: null,
      continuingText: '',
      options: ['继续'],
      activatedEntries: [],
      updatedAt: 1,
    });
    useStore.setState({
      currentWorldId: null,
      currentCharacterId: 'char-1',
      currentSessionId: 'session-1',
      memoryRefreshTick: 0,
    });

    renderChatPage();

    await waitFor(() => expect(mocks.recoverChatStream).toHaveBeenCalledWith('session-1'));
    await waitFor(() => expect(mocks.subscribeChatStream).toHaveBeenCalled());
    expect(mocks.subscribeChatStream.mock.calls[0][0]).toBe('session-1');
    expect(mocks.MessageListState.updateMessages).toHaveBeenCalled();
  });

  it('恢复到 restart 中断快照时不会补订阅', async () => {
    mocks.getSession.mockResolvedValue({ id: 'session-1', title: '会话', character_id: 'char-1' });
    mocks.recoverChatStream.mockResolvedValue({
      id: 'stream-1',
      sessionId: 'session-1',
      status: 'failed',
      error: 'interrupted by restart',
      messages: [{ id: 'user-1', role: 'user', content: '上一句' }],
      streamingText: '中断前文本',
      continuingMessageId: null,
      continuingText: '',
      options: [],
      activatedEntries: [],
      updatedAt: 2,
    });
    useStore.setState({
      currentWorldId: null,
      currentCharacterId: 'char-1',
      currentSessionId: 'session-1',
      memoryRefreshTick: 0,
    });

    renderChatPage();

    await waitFor(() => expect(mocks.recoverChatStream).toHaveBeenCalledWith('session-1'));
    expect(mocks.subscribeChatStream).not.toHaveBeenCalled();
    expect(mocks.MessageListState.updateMessages).toHaveBeenCalled();
    // 半截正文并入消息列表；错误气泡只给提示与重试，不再重复渲染一大段 partial
    const updater = mocks.MessageListState.updateMessages.mock.calls.at(-1)[0];
    expect(updater([]).at(-1)).toMatchObject({ role: 'assistant', content: '中断前文本' });
    expect(await screen.findByText('生成失败：interrupted by restart')).toBeInTheDocument();
    expect(screen.queryByText('中断前文本')).not.toBeInTheDocument();
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

    renderChatPage();

    await waitFor(() => expect(mocks.getCharacter).toHaveBeenCalledWith('char-1'));

    fireEvent.click(screen.getByText('send'));
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));

    await act(async () => {
      callbacks[0].onDone?.({ id: 'asst-1', content: '第一轮' }, []);
    });
    expect(screen.getByText('正在记录记忆…')).toBeInTheDocument();

    fireEvent.click(screen.getByText('send'));
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);

    vi.useFakeTimers();
    act(() => {
      callbacks[0].onStateUpdated?.();
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByText('正在记录记忆…')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('send'));
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('中断后的流式临时选项不会残留到下一轮', async () => {
    const callbacksRef = { current: null };
    mocks.getSession.mockResolvedValue({ id: 'session-1', title: '会话', character_id: 'char-1' });
    useStore.setState({
      currentWorldId: null,
      currentCharacterId: 'char-1',
      currentSessionId: 'session-1',
      memoryRefreshTick: 0,
    });
    mocks.sendMessage.mockImplementation((_sid, _content, _attachments, callbacks) => {
      callbacksRef.current = callbacks;
      return vi.fn();
    });

    renderChatPage();

    await waitFor(() => expect(mocks.getCharacter).toHaveBeenCalledWith('char-1'));

    fireEvent.click(screen.getByText('send'));
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));

    await act(async () => {
      callbacksRef.current.onDelta?.('回复正文<next_prompt>\n旧选项');
    });
    expect(screen.getByTestId('options')).toHaveTextContent('旧选项');

    await act(async () => {
      callbacksRef.current.onAborted?.({ id: 'asst-abort', content: '回复正文\n\n[已中断]' });
      callbacksRef.current.onStreamEnd?.();
    });
    expect(screen.getByTestId('options')).toHaveTextContent('');

    fireEvent.click(screen.getByText('send'));
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('options')).toHaveTextContent('');
  });

  it('支持代拟、重命名和停止', async () => {
    mocks.getSession.mockResolvedValue({ id: 'session-1', title: '会话', character_id: 'char-1' });
    useStore.setState({
      currentWorldId: null,
      currentCharacterId: 'char-1',
      currentSessionId: 'session-1',
      memoryRefreshTick: 0,
    });
    renderChatPage();
    await waitFor(() => expect(mocks.getCharacter).toHaveBeenCalledWith('char-1'));

    fireEvent.click(screen.getByText('impersonate'));
    await waitFor(() => expect(mocks.impersonate).toHaveBeenCalledWith('session-1'));

    fireEvent.click(screen.getByText('retitle'));
    await waitFor(() => expect(mocks.retitle).toHaveBeenCalledWith('session-1'));
    expect(await screen.findByText('标题已更新：新标题')).toBeInTheDocument();

    fireEvent.click(screen.getByText('stop'));
    expect(mocks.stopGeneration).toHaveBeenCalledWith('session-1');
  });

  it('后台整理失败和超时都会显示 toast', async () => {
    const callbacksRef = { current: null };
    mocks.getSession.mockResolvedValue({ id: 'session-1', title: '会话', character_id: 'char-1' });
    useStore.setState({
      currentWorldId: null,
      currentCharacterId: 'char-1',
      currentSessionId: 'session-1',
      memoryRefreshTick: 0,
    });
    mocks.sendMessage.mockImplementation((_sid, _content, _attachments, callbacks) => {
      callbacksRef.current = callbacks;
      return vi.fn();
    });

    renderChatPage();
    await waitFor(() => expect(mocks.getCharacter).toHaveBeenCalledWith('char-1'));

    fireEvent.click(screen.getByText('send'));
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));

    await act(async () => {
      callbacksRef.current.onDone?.({ id: 'asst-1', content: '第一轮' }, []);
      callbacksRef.current.onPostprocessFailed?.({ label: 'title', reason: 'timeout', error: 'timed out' });
    });
    expect(await screen.findByText('后台整理超时，回复已保留，标题或状态可能未更新')).toBeInTheDocument();

    await act(async () => {
      callbacksRef.current.onPostprocessFailed?.({ label: 'title', reason: 'unknown', error: 'failed' });
    });
    expect(await screen.findByText('后台整理失败，回复已保留，标题或状态可能未更新')).toBeInTheDocument();
  });

  it('生成中不会触发重命名', async () => {
    const callbacksRef = { current: null };
    mocks.getSession.mockResolvedValue({ id: 'session-1', title: '会话', character_id: 'char-1' });
    useStore.setState({
      currentWorldId: null,
      currentCharacterId: 'char-1',
      currentSessionId: 'session-1',
      memoryRefreshTick: 0,
    });
    mocks.sendMessage.mockImplementation((_sid, _content, _attachments, callbacks) => {
      callbacksRef.current = callbacks;
      return vi.fn();
    });

    renderChatPage();
    await waitFor(() => expect(mocks.getCharacter).toHaveBeenCalledWith('char-1'));

    fireEvent.click(screen.getByText('send'));
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('retitle'));
    expect(mocks.retitle).not.toHaveBeenCalled();

    await act(async () => {
      callbacksRef.current.onStreamEnd?.();
    });
    fireEvent.click(screen.getByText('retitle'));
    await waitFor(() => expect(mocks.retitle).toHaveBeenCalledWith('session-1'));
  });

  it('切换角色后不会带着旧日记注入到新会话', async () => {
    mocks.useParams.mockReturnValue({ characterId: 'char-1' });
    mocks.getCharacter
      .mockResolvedValueOnce({ id: 'char-1', world_id: 'world-1', name: '阿塔' })
      .mockResolvedValueOnce({ id: 'char-2', world_id: 'world-2', name: '贝拉' });
    mocks.getPersona
      .mockResolvedValueOnce({ name: '旅者' })
      .mockResolvedValueOnce({ name: '旅者' });

    const view = renderChatPage();
    await waitFor(() => expect(mocks.getCharacter).toHaveBeenCalledWith('char-1'));

    // 状态面板默认收在右侧窄轨里，先展开才能点到里面的 inject-diary（第 10 步：两侧改为可收起抽屉）
    fireEvent.click(screen.getByRole('button', { name: '展开状态面板' }));
    fireEvent.click(screen.getByText('inject-diary'));

    mocks.useParams.mockReturnValue({ characterId: 'char-2' });
    view.rerender(
      <PageLayoutRendererProvider render={renderPageLayout}>
        <ChatPage />
      </PageLayoutRendererProvider>,
    );

    await waitFor(() => expect(mocks.getCharacter).toHaveBeenCalledWith('char-2'));
    fireEvent.click(screen.getByText('send'));

    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalled());
    const lastCall = mocks.sendMessage.mock.calls.at(-1);
    expect(lastCall[4]).toEqual({});
  });

  it('支持编辑 AI 消息、删除消息和错误后重试', async () => {
    const callbacks = [];
    mocks.getSession.mockResolvedValue({ id: 'session-1', title: '会话', character_id: 'char-1' });
    useStore.setState({
      currentWorldId: null,
      currentCharacterId: 'char-1',
      currentSessionId: 'session-1',
      memoryRefreshTick: 0,
    });
    mocks.MessageListState.messagesRef.current = [
      { id: 'user-1', role: 'user', content: '问题' },
      { id: 'asst-1', role: 'assistant', content: '回答' },
    ];
    mocks.sendMessage.mockImplementation((_sid, _content, _attachments, cb) => {
      callbacks.push(cb);
      return vi.fn();
    });
    mocks.regenerate.mockImplementation(() => vi.fn());

    renderChatPage();
    await waitFor(() => expect(mocks.getCharacter).toHaveBeenCalledWith('char-1'));

    fireEvent.click(screen.getByText('edit-assistant'));
    await waitFor(() => expect(mocks.editAssistantMessage).toHaveBeenCalledWith('session-1', 'asst-1', '改写后的回复'));
    expect(await screen.findByText('已保存，摘要更新中…')).toBeInTheDocument();

    fireEvent.click(screen.getByText('delete-message'));
    await waitFor(() => expect(mocks.MessageListState.updateMessages).toHaveBeenCalled());

    fireEvent.click(screen.getByText('send'));
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(1));
    await act(async () => {
      callbacks[0].onError?.('网络波动');
      callbacks[0].onStreamEnd?.();
    });
    fireEvent.click(screen.getByText('重新生成'));
    await waitFor(() => expect(mocks.regenerate).toHaveBeenCalledWith('session-1', 'user-1', expect.any(Object)));
  });
});
