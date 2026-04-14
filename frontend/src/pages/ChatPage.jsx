import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import useStore from '../store/index.js';
import { getCharacter } from '../api/characters.js';
import { sendMessage, stopGeneration, regenerate, editAndRegenerate, continueGeneration, impersonate, clearMessages, triggerSummary } from '../api/chat.js';
import Sidebar from '../components/chat/Sidebar.jsx';
import MessageList from '../components/chat/MessageList.jsx';
import InputBox from '../components/chat/InputBox.jsx';
import MemoryPanel from '../components/memory/MemoryPanel.jsx';
import { loadRules } from '../utils/regex-runner.js';

export default function ChatPage() {
  const { characterId } = useParams();
  const { currentSessionId, setCurrentSessionId } = useStore();

  const [character, setCharacter] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [memoryRecalling, setMemoryRecalling] = useState(false);
  const [memoryExpanding, setMemoryExpanding] = useState(false);
  const [expandedMessage, setExpandedMessage] = useState('');
  const [rightOpen, setRightOpen] = useState(true);
  const [lastUserContent, setLastUserContent] = useState('');
  const [messageListKey, setMessageListKey] = useState(0);
  const [continuingMessageId, setContinuingMessageId] = useState(null);
  const [continuingText, setContinuingText] = useState('');
  const [fillText, setFillText] = useState('');
  const [toast, setToast] = useState(null);

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

  // 启动时加载正则规则缓存
  useEffect(() => {
    loadRules().catch(console.error);
  }, []);

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

  // Toast 提示（自动消失）
  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // 流状态清理
  const finalizeStream = useCallback(() => {
    setGenerating(false);
    setStreamingText('');
    setMemoryRecalling(false);
    setMemoryExpanding(false);
    setContinuingMessageId(null);
    setContinuingText('');
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
      onMemoryExpandStart() {
        setMemoryExpanding(true);
        setExpandedMessage('');
      },
      onMemoryExpandDone(evt) {
        setMemoryExpanding(false);
        const count = Array.isArray(evt?.expanded) ? evt.expanded.length : 0;
        if (count > 0) {
          setExpandedMessage(`已翻阅 ${count} 条历史对话`);
          setTimeout(() => setExpandedMessage(''), 3000);
        }
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

  // 续写最后一条 assistant 消息
  function handleContinue() {
    if (generating || !currentSessionId) return;

    // 找最后一条 assistant 消息 id
    let lastAssistantId = null;
    if (MessageList.updateMessages) {
      MessageList.updateMessages((prev) => {
        const last = [...prev].reverse().find((m) => m.role === 'assistant');
        if (last) lastAssistantId = last.id;
        return prev;
      });
    }
    if (!lastAssistantId) return;

    setContinuingMessageId(lastAssistantId);
    setContinuingText('');
    setGenerating(true);

    const callbacks = {
      onDelta(delta) {
        setContinuingText((prev) => prev + delta);
      },
      onDone() {},
      onAborted() { finalizeStream(); },
      onError(err) {
        console.error('continue error:', err);
        finalizeStream();
      },
      onStreamEnd() { finalizeStream(); },
    };

    const stop = continueGeneration(currentSessionId, callbacks);
    stopRef.current = stop;
  }

  // AI 代拟用户消息，填入输入框
  async function handleImpersonate() {
    if (generating || !currentSessionId) return;
    try {
      const { content } = await impersonate(currentSessionId);
      if (content) setFillText(content);
    } catch (err) {
      console.error('impersonate error:', err);
    }
  }

  // 重试：删除最后一条 assistant 消息并重新生成
  function handleRetryLast() {
    if (generating || !currentSessionId) return;

    let afterMessageId = null;
    if (MessageList.updateMessages) {
      MessageList.updateMessages((prev) => {
        const idx = [...prev].map((m, i) => ({ m, i })).reverse().find(({ m }) => m.role === 'assistant')?.i;
        if (idx === undefined || idx <= 0) return prev;
        afterMessageId = prev[idx - 1].id;
        return prev.slice(0, idx);
      });
    }
    if (!afterMessageId) return;

    setGenerating(true);
    setStreamingText('');
    const stop = regenerate(currentSessionId, afterMessageId, makeCallbacks());
    stopRef.current = stop;
  }

  // 清空会话消息
  async function handleClearMessages() {
    if (!currentSessionId) return;
    if (!window.confirm('确认清空当前会话所有消息？')) return;
    try {
      const { firstMessage } = await clearMessages(currentSessionId);
      if (firstMessage) {
        // 角色有开场白，重新插入
        const fakeMsg = {
          id: `__first_${Date.now()}`,
          session_id: currentSessionId,
          role: 'assistant',
          content: firstMessage,
          attachments: null,
          created_at: Date.now(),
        };
        if (MessageList.updateMessages) {
          MessageList.updateMessages(() => [fakeMsg]);
        }
      } else {
        if (MessageList.updateMessages) {
          MessageList.updateMessages(() => []);
        }
      }
      // 刷新以拿到真实 id
      refreshMessages();
    } catch (err) {
      alert(err.message || '清空失败');
    }
  }

  // 手动生成摘要
  async function handleManualSummary() {
    if (!currentSessionId) return;
    try {
      await triggerSummary(currentSessionId);
      showToast('摘要已生成');
    } catch (err) {
      showToast(err.message || '摘要生成失败', 'error');
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg)]" style={{ position: 'relative' }}>
      {/* Toast 提示 */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm shadow-lg pointer-events-none ${
            toast.type === 'error'
              ? 'bg-red-500 text-white'
              : 'bg-[var(--accent)] text-white'
          }`}
        >
          {toast.msg}
        </div>
      )}
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
          worldId={character?.world_id ?? null}
          generating={generating}
          streamingText={streamingText}
          memoryRecalling={memoryRecalling}
          memoryExpanding={memoryExpanding}
          expandedMessage={expandedMessage}
          onEditMessage={handleEditMessage}
          onRegenerateMessage={handleRegenerateMessage}
          continuingMessageId={continuingMessageId}
          continuingText={continuingText}
        />

        {/* 输入框 */}
        <InputBox
          onSend={handleSend}
          onStop={handleStop}
          generating={generating}
          lastUserContent={lastUserContent}
          worldId={character?.world_id ?? null}
          onContinue={handleContinue}
          onImpersonate={handleImpersonate}
          onRetry={handleRetryLast}
          onClear={handleClearMessages}
          onSummary={handleManualSummary}
          fillText={fillText}
          onFillTextConsumed={() => setFillText('')}
        />
      </div>

      {/* 右栏：记忆面板（300px，可收起） */}
      {rightOpen && character && (
        <div className="w-[300px] flex-none border-l border-[var(--border)] flex flex-col overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-[var(--border)] shrink-0">
            <h2 className="text-sm font-semibold text-[var(--text-h)]">记忆面板</h2>
          </div>
          <div className="flex-1 overflow-hidden">
            <MemoryPanel worldId={character.world_id} characterId={characterId} />
          </div>
        </div>
      )}
    </div>
  );
}
