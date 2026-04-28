import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  function createMessageListMock() {
    return {
      appendMessage: vi.fn(),
      updateMessages: vi.fn(),
      messagesRef: { current: [] },
    };
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
    getPersonaById: vi.fn(),
    listWritingSessions: vi.fn(),
    createWritingSession: vi.fn(),
    listActiveCharacters: vi.fn(),
    generate: vi.fn(),
    continueGeneration: vi.fn(),
    stopGeneration: vi.fn(),
    retitleWritingSession: vi.fn(),
    updateChapterTitle: vi.fn(),
    retitleChapter: vi.fn(),
    impersonateWriting: vi.fn(),
    pushErrorToast: vi.fn(),
    getChapterTitles: vi.fn(),
    MessageListState: createMessageListMock(),
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
vi.mock('../../src/api/config.js', () => ({ getConfig: vi.fn(async () => ({ ui: {}, writing: {} })) }));
vi.mock('../../src/api/worlds.js', () => ({ getWorld: (...args) => mocks.getWorld(...args) }));
vi.mock('../../src/api/personas.js', () => ({
  getPersona: (...args) => mocks.getPersona(...args),
  getPersonaById: (...args) => mocks.getPersonaById(...args),
}));
vi.mock('../../src/api/writing-sessions.js', () => ({
  listWritingSessions: (...args) => mocks.listWritingSessions(...args),
  createWritingSession: (...args) => mocks.createWritingSession(...args),
  listActiveCharacters: (...args) => mocks.listActiveCharacters(...args),
  generate: (...args) => mocks.generate(...args),
  stopGeneration: (...args) => mocks.stopGeneration(...args),
  continueGeneration: (...args) => mocks.continueGeneration(...args),
  regenerateWriting: vi.fn(),
  editAndRegenerateWriting: vi.fn(),
  editWritingAssistantMessage: vi.fn(),
  impersonateWriting: (...args) => mocks.impersonateWriting(...args),
  extractCharactersFromMessage: vi.fn(),
  confirmCharacters: vi.fn(),
  retitleWritingSession: (...args) => mocks.retitleWritingSession(...args),
}));
vi.mock('../../src/api/sessions.js', () => ({ deleteMessage: vi.fn() }));
vi.mock('../../src/components/chat/MessageList.jsx', () => ({
  default: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      appendMessage: mocks.MessageListState.appendMessage,
      updateMessages: mocks.MessageListState.updateMessages,
      messagesRef: mocks.MessageListState.messagesRef,
    }));
    return (
      <div data-testid="message-list">
        {props.sessionId || 'none'}
        <button onClick={() => props.onChapterEdit?.(1, '手改标题')}>edit-chapter</button>
        <button onClick={() => props.onChapterRetitle?.(1)}>retitle-chapter</button>
      </div>
    );
  }),
}));
vi.mock('../../src/components/book/WritingPageLeft.jsx', () => ({
  default: ({ memoryWriting }) => (
    <div data-testid="left">{memoryWriting ? 'memory-writing' : 'memory-idle'}</div>
  ),
}));
vi.mock('../../src/components/book/CastPanel.jsx', () => ({ default: () => <div data-testid="cast" /> }));
vi.mock('../../src/components/book/WritingSessionList.jsx', () => ({ default: mocks.WritingSessionListMock }));
vi.mock('../../src/components/chat/InputBox.jsx', () => ({
  default: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ fillText: vi.fn() }));
    return (
      <>
        <button onClick={() => props.onSend('写作消息')}>send-writing</button>
        <button onClick={() => props.onContinue?.()}>continue-writing</button>
        <button onClick={() => props.onImpersonate?.()}>impersonate-writing</button>
        <button onClick={() => props.onTitle?.()}>retitle-writing</button>
        <button onClick={() => props.onStop?.()}>stop-writing</button>
      </>
    );
  }),
}));
vi.mock('../../src/components/chat/OptionCard.jsx', () => ({ default: ({ options }) => <div>{options.join(',')}</div> }));
vi.mock('../../src/api/chapter-titles.js', () => ({
  getChapterTitles: (...args) => mocks.getChapterTitles(...args),
  updateChapterTitle: (...args) => mocks.updateChapterTitle(...args),
  retitleChapter: (...args) => mocks.retitleChapter(...args),
}));
vi.mock('../../src/utils/toast.js', () => ({
  pushToast: vi.fn(),
  pushErrorToast: (...args) => mocks.pushErrorToast(...args),
}));
vi.mock('../../src/components/writing/CharacterPreviewModal.jsx', () => ({ default: () => <div data-testid="preview-modal" /> }));
vi.mock('../../src/components/writing/CharacterAnalyzingModal.jsx', () => ({ default: () => <div data-testid="analyzing-modal" /> }));

import WritingSpacePage from '../../src/pages/WritingSpacePage.jsx';

describe('WritingSpacePage', () => {
  beforeEach(() => {
    mocks.useParams.mockReturnValue({ worldId: 'world-1' });
    mocks.getWorld.mockResolvedValue({ id: 'world-1', name: '世界' });
    mocks.getPersona.mockResolvedValue({ name: '旅者' });
    mocks.getPersonaById.mockRejectedValue(new Error('no persona id'));
    mocks.listWritingSessions.mockResolvedValue([]);
    mocks.createWritingSession.mockResolvedValue({ id: 'ws-1', title: null });
    mocks.listActiveCharacters.mockResolvedValue([{ id: 'char-1', name: '阿塔' }]);
    mocks.continueGeneration.mockReset();
    mocks.generate.mockReset();
    mocks.stopGeneration.mockReset();
    mocks.retitleWritingSession.mockReset();
    mocks.updateChapterTitle.mockReset();
    mocks.retitleChapter.mockReset();
    mocks.impersonateWriting.mockReset();
    mocks.pushErrorToast.mockReset();
    mocks.getChapterTitles.mockResolvedValue([]);
    mocks.retitleWritingSession.mockResolvedValue({ title: '新章节名' });
    mocks.updateChapterTitle.mockResolvedValue({ title: '手改标题' });
    mocks.retitleChapter.mockResolvedValue({ title: 'AI 章节名' });
    mocks.impersonateWriting.mockResolvedValue({ content: '写作代拟' });
    mocks.stopGeneration.mockResolvedValue({});
    mocks.generate.mockImplementation((_wid, _sid, _content, callbacks) => {
      callbacks.onDone?.({ id: 'asst-1', content: '段落' }, ['下一步']);
      callbacks.onStreamEnd?.();
      return vi.fn();
    });
  });

  afterEach(() => {
    mocks.refreshCustomCss.mockReset();
    vi.useRealTimers();
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
    mocks.MessageListState.messagesRef.current = [
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

  it('writing continue 收尾时使用后端最终 assistant 内容，避免 next_prompt 进入消息渲染', async () => {
    const callbacksRef = { current: null };
    mocks.listWritingSessions.mockResolvedValue([{ id: 'ws-1', title: '章节一' }]);
    mocks.continueGeneration.mockImplementation((_wid, _sid, callbacks) => {
      callbacksRef.current = callbacks;
      return vi.fn();
    });
    mocks.MessageListState.messagesRef.current = [
      { id: 'asst-1', role: 'assistant', content: '第一段' },
    ];

    render(<WritingSpacePage />);

    await waitFor(() => expect(screen.getByTestId('message-list')).toHaveTextContent('ws-1'));
    fireEvent.click(screen.getByText('continue-writing'));

    await act(async () => {
      callbacksRef.current.onDelta?.('第二段<next_prompt>\n选项一');
      callbacksRef.current.onDone?.({ id: 'asst-1', role: 'assistant', content: '第一段\n\n第二段' }, ['选项一']);
      callbacksRef.current.onStreamEnd?.();
    });

    const updater = mocks.MessageListState.updateMessages.mock.calls.at(-1)[0];
    const updated = updater([{ id: 'asst-1', role: 'assistant', content: '第一段' }]);
    expect(updated[0].content).toBe('第一段\n\n第二段');
  });

  it('旧普通写作流 onStreamEnd 不会解锁正在进行的新流', async () => {
    const callbacks = [];
    mocks.listWritingSessions.mockResolvedValue([{ id: 'ws-1', title: '章节一' }]);
    mocks.MessageListState.messagesRef.current = [{ id: 'asst-0', role: 'assistant', content: '已有段落' }];
    mocks.generate.mockImplementation((_wid, _sid, _content, cb) => {
      callbacks.push(cb);
      return vi.fn();
    });

    render(<WritingSpacePage />);

    await waitFor(() => expect(mocks.listWritingSessions).toHaveBeenCalledWith('world-1'));
    await waitFor(() => expect(mocks.listActiveCharacters).toHaveBeenCalledWith('world-1', 'ws-1'));

    fireEvent.click(screen.getByText('send-writing'));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));

    await act(async () => {
      callbacks[0].onDone?.({ id: 'asst-1', content: '第一段' }, []);
    });
    fireEvent.click(screen.getByText('send-writing'));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));

    await act(async () => {
      callbacks[0].onStreamEnd?.();
    });
    fireEvent.click(screen.getByText('send-writing'));
    expect(mocks.generate).toHaveBeenCalledTimes(2);

    await act(async () => {
      callbacks[1].onStreamEnd?.();
    });
    fireEvent.click(screen.getByText('send-writing'));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(3));
  });

  it('旧普通写作流 state_updated 会收起旧轮记忆记录提示，但不会解锁新流', async () => {
    const callbacks = [];
    mocks.listWritingSessions.mockResolvedValue([{ id: 'ws-1', title: '章节一' }]);
    mocks.generate.mockImplementation((_wid, _sid, _content, cb) => {
      callbacks.push(cb);
      return vi.fn();
    });

    render(<WritingSpacePage />);

    await waitFor(() => expect(mocks.listWritingSessions).toHaveBeenCalledWith('world-1'));
    await waitFor(() => expect(mocks.listActiveCharacters).toHaveBeenCalledWith('world-1', 'ws-1'));

    fireEvent.click(screen.getByText('send-writing'));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));

    await act(async () => {
      callbacks[0].onDone?.({ id: 'asst-1', content: '第一段' }, []);
    });
    expect(screen.getByTestId('left')).toHaveTextContent('memory-writing');

    fireEvent.click(screen.getByText('send-writing'));
    expect(mocks.generate).toHaveBeenCalledTimes(2);

    vi.useFakeTimers();
    act(() => {
      callbacks[0].onStateUpdated?.();
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByTestId('left')).toHaveTextContent('memory-idle');

    fireEvent.click(screen.getByText('send-writing'));
    expect(mocks.generate).toHaveBeenCalledTimes(2);
  });

  it('支持重命名会话、编辑章节、AI 重拟章节和停止', async () => {
    mocks.listWritingSessions.mockResolvedValue([{ id: 'ws-1', title: '章节一' }]);
    render(<WritingSpacePage />);

    await waitFor(() => expect(screen.getByTestId('message-list')).toHaveTextContent('ws-1'));

    fireEvent.click(screen.getByText('retitle-writing'));
    await waitFor(() => expect(mocks.retitleWritingSession).toHaveBeenCalledWith('world-1', 'ws-1'));

    fireEvent.click(screen.getByText('edit-chapter'));
    await waitFor(() => expect(mocks.updateChapterTitle).toHaveBeenCalledWith('world-1', 'ws-1', 1, '手改标题'));

    fireEvent.click(screen.getByText('retitle-chapter'));
    await waitFor(() => expect(mocks.retitleChapter).toHaveBeenCalledWith('world-1', 'ws-1', 1));

    fireEvent.click(screen.getByText('stop-writing'));
    expect(mocks.stopGeneration).toHaveBeenCalledWith('world-1', 'ws-1');
  });

  it('代拟和章节操作失败时显示错误 toast', async () => {
    mocks.listWritingSessions.mockResolvedValue([{ id: 'ws-1', title: '章节一' }]);
    mocks.impersonateWriting.mockRejectedValue(new Error('代拟失败'));
    mocks.updateChapterTitle.mockRejectedValue(new Error('保存失败'));
    mocks.retitleChapter.mockRejectedValue(new Error('重拟失败'));

    render(<WritingSpacePage />);
    await waitFor(() => expect(screen.getByTestId('message-list')).toHaveTextContent('ws-1'));

    fireEvent.click(screen.getByText('impersonate-writing'));
    await waitFor(() => expect(mocks.pushErrorToast).toHaveBeenCalledWith('代拟失败'));

    fireEvent.click(screen.getByText('edit-chapter'));
    await waitFor(() => expect(mocks.pushErrorToast).toHaveBeenCalledWith('保存失败'));

    fireEvent.click(screen.getByText('retitle-chapter'));
    await waitFor(() => expect(mocks.pushErrorToast).toHaveBeenCalledWith('重拟失败'));
  });
});
