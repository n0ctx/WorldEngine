import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import useStore from '../store/index.js';
import { getCharacter } from '../api/characters.js';
import { sendMessage, stopGeneration, regenerate, editAndRegenerate } from '../api/chat.js';
import Sidebar from '../components/chat/Sidebar.jsx';
import MessageList from '../components/chat/MessageList.jsx';
import InputBox from '../components/chat/InputBox.jsx';

export default function ChatPage() {
  const { characterId } = useParams();
  const { currentSessionId, setCurrentSessionId } = useStore();

  const [character, setCharacter] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [memoryRecalling, setMemoryRecalling] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);
  const [lastUserContent, setLastUserContent] = useState('');
  const [messageListKey, setMessageListKey] = useState(0);

  const stopRef = useRef(null);
  const currentSessionIdRef = useRef(currentSessionId);

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // 加载角色信息
  useEffect(() => {
    if (!characterId) return;
    getCharacter(characterId).then(setCharacter).catch(console.error);
  }, [characterId]);

  // 选择会话
  function handleSessionSelect(session) {
    setCurrentSessionId(session.id);
    setCurrentSession(session);
    setGenerating(false);
    setStreamingText('');
    setMessageListKey((k) => k + 1);
  }

  // 新建会话后自动进入
  function handleSessionCreate(session) {
    setCurrentSessionId(session.id);
    setCurrentSession(session);
    setGenerating(false);
    setStreamingText('');
    setMessageListKey((k) => k + 1);
  }

  // 删除当前会话后切换到第一个，或清空
  function handleSessionDelete(deletedId, remaining) {
    if (deletedId === currentSessionId) {
      if (remaining.length > 0) {
        handleSessionSelect(remaining[0]);
      } else {
        setCurrentSessionId(null);
        setCurrentSession(null);
        setMessageListKey((k) => k + 1);
      }
    }
  }

  // 流结束后刷新消息列表
  function refreshMessages() {
    setMessageListKey((k) => k + 1);
  }

  // 流状态清理
  const finalizeStream = useCallback(() => {
    setGenerating(false);
    setStreamingText('');
    setMemoryRecalling(false);
    stopRef.current = null;
    refreshMessages();
  }, []);

  // 共用 SSE callbacks
  function makeCallbacks() {
    return {
      onDelta(delta) {
        setStreamingText((prev) => prev + delta);
      },
      onDone() {
        // 流可能还有 title_updated，等 onStreamEnd 再终结
      },
      onAborted() {
        finalizeStream();
      },
      onError(err) {
        console.error('SSE error:', err);
        finalizeStream();
      },
      onTitleUpdated(title) {
        setCurrentSession((prev) => (prev ? { ...prev, title } : prev));
        if (Sidebar.updateTitle && currentSessionIdRef.current) {
          Sidebar.updateTitle(currentSessionIdRef.current, title);
        }
      },
      onMemoryRecallStart() {
        setMemoryRecalling(true);
      },
      onMemoryRecallDone() {
        setMemoryRecalling(false);
      },
      onStreamEnd() {
        finalizeStream();
      },
    };
  }

  // 发送消息
  function handleSend(content, attachments) {
    if (!currentSessionId || generating) return;

    setLastUserContent(content);

    // 乐观追加 user 消息到列表
    const tempUserMsg = {
      id: `__temp_${Date.now()}`,
      session_id: currentSessionId,
      role: 'user',
      content,
      attachments: null,
      created_at: Date.now(),
    };
    if (MessageList.appendMessage) MessageList.appendMessage(tempUserMsg);

    setGenerating(true);
    setStreamingText('');

    const stop = sendMessage(currentSessionId, content, attachments, makeCallbacks());
    stopRef.current = stop;
  }

  // 停止生成
  function handleStop() {
    stopRef.current?.();
    stopGeneration(currentSessionId).catch(console.error);
  }

  // 编辑并重新生成
  function handleEditMessage(messageId, newContent) {
    if (generating) return;

    // 截断消息列表到被编辑消息（含，内容替换）
    if (MessageList.updateMessages) {
      MessageList.updateMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === messageId);
        if (idx === -1) return prev;
        return [...prev.slice(0, idx), { ...prev[idx], content: newContent }];
      });
    }

    setGenerating(true);
    setStreamingText('');

    const stop = editAndRegenerate(currentSessionId, messageId, newContent, makeCallbacks());
    stopRef.current = stop;
  }

  // 重新生成 assistant 消息
  function handleRegenerateMessage(assistantMessageId) {
    if (generating || !currentSessionId) return;

    let afterMessageId = null;

    if (MessageList.updateMessages) {
      MessageList.updateMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === assistantMessageId);
        if (idx > 0) afterMessageId = prev[idx - 1].id;
        return idx >= 0 ? prev.slice(0, idx) : prev;
      });
    }

    if (!afterMessageId) return;

    setGenerating(true);
    setStreamingText('');

    const stop = regenerate(currentSessionId, afterMessageId, makeCallbacks());
    stopRef.current = stop;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]">
      {/* 左栏：会话列表（260px） */}
      <div className="w-[260px] flex-none border-r border-[var(--border)] flex flex-col overflow-hidden">
        <Sidebar
          character={character}
          currentSessionId={currentSessionId}
          onSessionSelect={handleSessionSelect}
          onSessionCreate={handleSessionCreate}
          onSessionDelete={handleSessionDelete}
        />
      </div>

      {/* 中栏：对话区（弹性，内容最大 800px 居中） */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* 顶部栏 */}
        <div className="flex items-center px-4 pt-3 pb-2 border-b border-[var(--border)] shrink-0">
          {currentSession ? (
            <h1 className="flex-1 text-sm font-medium text-[var(--text-h)] truncate">
              {currentSession.title || '新对话'}
            </h1>
          ) : (
            <span className="flex-1" />
          )}
          <button
            onClick={() => setRightOpen((o) => !o)}
            className="p-1.5 rounded-lg text-[var(--text)] opacity-40 hover:opacity-80 hover:bg-[var(--border)] transition-all"
            title={rightOpen ? '收起记忆面板' : '展开记忆面板'}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ transform: rightOpen ? 'scaleX(1)' : 'scaleX(-1)', transition: 'transform 0.2s' }}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
          </button>
        </div>

        {/* 消息列表 */}
        <MessageList
          key={`${currentSessionId}-${messageListKey}`}
          sessionId={currentSessionId}
          character={character}
          generating={generating}
          streamingText={streamingText}
          memoryRecalling={memoryRecalling}
          onEditMessage={handleEditMessage}
          onRegenerateMessage={handleRegenerateMessage}
        />

        {/* 输入框 */}
        <InputBox
          onSend={handleSend}
          onStop={handleStop}
          generating={generating}
          lastUserContent={lastUserContent}
        />
      </div>

      {/* 右栏：记忆面板（300px，可收起；T22 实现内容） */}
      {rightOpen && (
        <div className="w-[300px] flex-none border-l border-[var(--border)] flex flex-col overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-[var(--border)] shrink-0">
            <h2 className="text-sm font-semibold text-[var(--text-h)]">记忆面板</h2>
            <p className="text-xs opacity-30 mt-0.5">T22 实现</p>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-y-auto">
            <p className="text-xs opacity-25">暂无记忆数据</p>
          </div>
        </div>
      )}
    </div>
  );
}
