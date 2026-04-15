import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useStore from '../store/index.js';
import { getCharacter } from '../api/characters.js';
import { getPersona } from '../api/personas.js';
import { sendMessage, stopGeneration, regenerate, editAndRegenerate, continueGeneration, impersonate, clearMessages, triggerSummary } from '../api/chat.js';
import Sidebar from '../components/chat/Sidebar.jsx';
import MessageList from '../components/chat/MessageList.jsx';
import InputBox from '../components/chat/InputBox.jsx';
import MemoryPanel from '../components/memory/MemoryPanel.jsx';
import { loadRules } from '../utils/regex-runner.js';
import { getAvatarColor, getAvatarUrl } from '../utils/avatar.js';

export default function ChatPage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const { currentSessionId, setCurrentSessionId } = useStore();

  const [character, setCharacter] = useState(null);
  const [persona, setPersona] = useState(null);
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
  const [errorBubble, setErrorBubble] = useState(null); // { partialContent, errorMsg }

  const stopRef = useRef(null);
  const currentSessionIdRef = useRef(currentSessionId);
  const streamingTextRef = useRef('');

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // 加载角色信息
  useEffect(() => {
    if (!characterId) return;
    getCharacter(characterId).then((c) => {
      setCharacter(c);
      if (c.world_id) {
        getPersona(c.world_id).then(setPersona).catch(() => {});
      }
    }).catch(console.error);
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
    setErrorBubble(null);
    streamingTextRef.current = '';
    setMessageListKey((k) => k + 1);
  }

  // 新建会话后自动进入
  function handleSessionCreate(session) {
    setCurrentSessionId(session.id);
    setCurrentSession(session);
    setGenerating(false);
    setStreamingText('');
    setErrorBubble(null);
    streamingTextRef.current = '';
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
        setStreamingText((prev) => {
          const next = prev + delta;
          streamingTextRef.current = next;
          return next;
        });
      },
      onDone() {
        // 流可能还有 title_updated，等 onStreamEnd 再终结
      },
      onAborted() {
        streamingTextRef.current = '';
        finalizeStream();
      },
      onError(err) {
        console.error('SSE error:', err);
        const partial = streamingTextRef.current;
        const errMsg = typeof err === 'string' ? err : (err?.message || '生成失败');
        streamingTextRef.current = '';
        setErrorBubble({ partialContent: partial, errorMsg: errMsg });
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

    setErrorBubble(null);
    streamingTextRef.current = '';
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

    setErrorBubble(null);
    streamingTextRef.current = '';

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

    setErrorBubble(null);
    streamingTextRef.current = '';

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

    setErrorBubble(null);
    streamingTextRef.current = '';

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

  // 错误后重试：从最后一条 user 消息重新生成
  function handleRetryAfterError() {
    if (generating || !currentSessionId) return;
    setErrorBubble(null);
    streamingTextRef.current = '';

    let afterMessageId = null;
    if (MessageList.updateMessages) {
      MessageList.updateMessages((prev) => {
        // 去掉末尾可能残留的 assistant 消息
        let end = prev.length;
        while (end > 0 && prev[end - 1].role === 'assistant') end--;
        const trimmed = prev.slice(0, end);
        const lastUser = [...trimmed].reverse().find((m) => m.role === 'user');
        if (lastUser) afterMessageId = lastUser.id;
        return trimmed;
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
    <div className="we-app flex h-screen overflow-hidden bg-canvas" style={{ position: 'relative' }}>
      {/* Toast 提示 */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm shadow-lg pointer-events-none ${
            toast.type === 'error'
              ? 'bg-red-500 text-white'
              : 'bg-accent text-white'
          }`}
        >
          {toast.msg}
        </div>
      )}
      {/* 左栏：会话列表（260px） */}
      <div className="w-[260px] flex-none border-r border-border flex flex-col overflow-hidden">
        <Sidebar
          character={character}
          currentSessionId={currentSessionId}
          onSessionSelect={handleSessionSelect}
          onSessionCreate={handleSessionCreate}
          onSessionDelete={handleSessionDelete}
        />
      </div>

      {/* 中栏：对话区（弹性，内容最大 800px 居中） */}
      <div className="we-main flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* 顶部栏 */}
        <div className="flex items-center px-4 pt-3 pb-2 border-b border-border shrink-0">
          {currentSession ? (
            <h1 className="flex-1 text-sm font-medium text-text truncate">
              {currentSession.title || '新对话'}
            </h1>
          ) : (
            <span className="flex-1" />
          )}
          <button
            onClick={() => navigate('/settings')}
            className="p-1.5 mr-1 rounded-lg text-text-secondary opacity-40 hover:opacity-80 hover:bg-sand transition-all"
            title="设置"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button
            onClick={() => setRightOpen((o) => !o)}
            className="p-1.5 rounded-lg text-text-secondary opacity-40 hover:opacity-80 hover:bg-sand transition-all"
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
          persona={persona}
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

        {/* 错误气泡：生成失败时保留可见，提供重试入口 */}
        {errorBubble && !generating && (
          <div className="px-4 pb-2 shrink-0">
            <div className="max-w-[800px] mx-auto">
              <div className="flex items-start gap-3">
                <div
                  className="flex-none w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden"
                  style={{ background: getAvatarColor(character?.id) }}
                >
                  {getAvatarUrl(character?.avatar_path)
                    ? <img src={getAvatarUrl(character?.avatar_path)} alt="" className="w-6 h-6 object-cover" />
                    : (character?.name?.[0] || '?')}
                </div>
                <div className="flex flex-col gap-1 max-w-[75%]">
                  <span className="text-xs opacity-50">{character?.name}</span>
                  {errorBubble.partialContent && (
                    <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-ivory border border-border text-text text-sm leading-relaxed whitespace-pre-wrap opacity-60">
                      {errorBubble.partialContent}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-200">
                      生成失败：{errorBubble.errorMsg}
                    </span>
                    <button
                      onClick={handleRetryAfterError}
                      className="text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-sand transition-colors flex items-center gap-1 text-text-secondary"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 .49-4.98" />
                      </svg>
                      重新生成
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

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
        <div className="w-[300px] flex-none border-l border-border flex flex-col overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
            <h2 className="text-sm font-semibold text-text">记忆面板</h2>
          </div>
          <div className="flex-1 overflow-hidden">
            <MemoryPanel worldId={character.world_id} characterId={characterId} />
          </div>
        </div>
      )}
    </div>
  );
}
