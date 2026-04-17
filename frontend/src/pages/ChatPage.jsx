import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useStore from '../store/index.js';
import { getCharacter } from '../api/characters.js';
import { getPersona } from '../api/personas.js';
import { sendMessage, stopGeneration, regenerate, editAndRegenerate, continueGeneration, impersonate, clearMessages, triggerSummary, editAssistantMessage } from '../api/chat.js';
import { createSession } from '../api/sessions.js';
import SessionListPanel from '../components/book/SessionListPanel.jsx';
import MessageList from '../components/chat/MessageList.jsx';
import InputBox from '../components/chat/InputBox.jsx';
import BookSpread from '../components/book/BookSpread.jsx';
import PageLeft from '../components/book/PageLeft.jsx';
import PageRight from '../components/book/PageRight.jsx';
import StatePanel from '../components/book/StatePanel.jsx';
import PageFooter from '../components/book/PageFooter.jsx';
import CandleFlame from '../components/book/CandleFlame.jsx';
import { getWorld } from '../api/worlds.js';
import { loadRules } from '../utils/regex-runner.js';
import { getAvatarColor, getAvatarUrl } from '../utils/avatar.js';

export default function ChatPage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const { currentSessionId, setCurrentSessionId } = useStore();

  const [character, setCharacter] = useState(null);
  const [persona, setPersona] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [worldName, setWorldName] = useState('');
  const [footerChapterIndex, setFooterChapterIndex] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [memoryRecalling, setMemoryRecalling] = useState(false);
  const [memoryExpanding, setMemoryExpanding] = useState(false);
  const [recallVisible, setRecallVisible] = useState(false);
  const [recalledItems, setRecalledItems] = useState([]);
  const [expandedMessage, setExpandedMessage] = useState('');
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
  const continuingMessageIdRef = useRef(null);
  const continuingTextRef = useRef('');

  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  const clearActiveSession = useCallback(() => {
    setCurrentSessionId(null);
    setCurrentSession(null);
    setGenerating(false);
    setStreamingText('');
    setErrorBubble(null);
    setMemoryRecalling(false);
    setMemoryExpanding(false);
    setExpandedMessage('');
    setRecallVisible(false);
    setContinuingMessageId(null);
    setContinuingText('');
    streamingTextRef.current = '';
    continuingMessageIdRef.current = null;
    continuingTextRef.current = '';
    stopRef.current = null;
    setMessageListKey((k) => k + 1);
  }, [setCurrentSessionId]);

  // 加载角色信息
  useEffect(() => {
    if (!characterId) return;
    clearActiveSession();
    setCharacter(null);
    setPersona(null);
    getCharacter(characterId).then((c) => {
      setCharacter(c);
      if (c.world_id) {
        getPersona(c.world_id).then(setPersona).catch(() => {});
        getWorld(c.world_id).then((w) => setWorldName(w.name || '')).catch(() => {});
      }
    }).catch(console.error);
  }, [characterId, clearActiveSession]);

  // 启动时加载正则规则缓存
  useEffect(() => {
    loadRules().catch(console.error);
  }, []);

  function enterSession(session) {
    setCurrentSessionId(session.id);
    setCurrentSession(session);
    setGenerating(false);
    setStreamingText('');
    setErrorBubble(null);
    streamingTextRef.current = '';
    setMessageListKey((k) => k + 1);
  }

  const handleSessionSelect = enterSession;
  const handleSessionCreate = enterSession;

  // 删除当前会话后切换到第一个，或清空
  function handleSessionDelete(deletedId, remaining) {
    const activeSessionId = currentSessionIdRef.current;
    if (deletedId === activeSessionId) {
      if (remaining.length > 0) {
        handleSessionSelect(remaining[0]);
      } else {
        clearActiveSession();
      }
      return;
    }

    if (activeSessionId && !remaining.some((session) => session.id === activeSessionId)) {
      clearActiveSession();
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
    // 续写场景：原地合并消息内容，不重挂载 MessageList，避免气泡闪烁
    const wasContinuing = !!continuingMessageIdRef.current;
    if (wasContinuing && MessageList.updateMessages) {
      const contId = continuingMessageIdRef.current;
      const contText = continuingTextRef.current;
      MessageList.updateMessages((prev) =>
        prev.map((m) => m.id === contId ? { ...m, content: m.content + contText } : m)
      );
    }
    continuingMessageIdRef.current = null;
    continuingTextRef.current = '';
    setGenerating(false);
    setStreamingText('');
    setMemoryRecalling(false);
    setMemoryExpanding(false);
    setRecallVisible(false);
    setContinuingMessageId(null);
    setContinuingText('');
    stopRef.current = null;
    // 续写时已原地更新，无需重挂载 MessageList；普通流结束需要重拉最新数据
    if (!wasContinuing) refreshMessages();
    useStore.getState().triggerMemoryRefresh();
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
        if (SessionListPanel.updateTitle && currentSessionIdRef.current) {
          SessionListPanel.updateTitle(currentSessionIdRef.current, title);
        }
      },
      onMemoryRecallStart() {
        setMemoryRecalling(true);
        setRecallVisible(true);
      },
      onMemoryRecallDone(evt) {
        setMemoryRecalling(false);
        const hit = evt?.hit ?? 0;
        if (hit > 0) {
          setRecalledItems(
            Array.from({ length: hit }, (_, i) => ({ id: `recall-${i}`, text: `召回摘要 ${i + 1}` }))
          );
          setTimeout(() => setRecallVisible(false), 300);
        } else {
          setRecallVisible(false);
        }
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
  async function handleSend(content, attachments) {
    if (generating) return;

    let sessionId = currentSessionId;
    if (!sessionId) {
      if (!character) return;
      const newSession = await createSession(character.id);
      enterSession(newSession);
      SessionListPanel.addSession(newSession);
      sessionId = newSession.id;
    }

    setErrorBubble(null);
    streamingTextRef.current = '';
    setLastUserContent(content);

    // 乐观追加 user 消息到列表
    const tempUserMsg = {
      id: `__temp_${Date.now()}`,
      session_id: sessionId,
      role: 'user',
      content,
      attachments: null,
      created_at: Date.now(),
    };
    if (MessageList.appendMessage) MessageList.appendMessage(tempUserMsg);

    setGenerating(true);
    setStreamingText('');

    const stop = sendMessage(sessionId, content, attachments, makeCallbacks());
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

    continuingMessageIdRef.current = lastAssistantId;
    continuingTextRef.current = '';
    setContinuingMessageId(lastAssistantId);
    setContinuingText('');
    setGenerating(true);

    const callbacks = {
      onDelta(delta) {
        continuingTextRef.current += delta;
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

  // 编辑 AI 消息（不重新生成，仅更新内容并重新生成 summary）
  async function handleEditAssistantMessage(messageId, newContent) {
    if (generating) return;
    if (MessageList.updateMessages) {
      MessageList.updateMessages((prev) =>
        prev.map((m) => m.id === messageId ? { ...m, content: newContent } : m)
      );
    }
    try {
      await editAssistantMessage(currentSessionId, messageId, newContent);
      showToast('已保存，摘要更新中…');
    } catch (err) {
      showToast(err.message || '保存失败', 'error');
      refreshMessages();
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
    <BookSpread>
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

      {/* 左页：会话列表 */}
      <PageLeft
        character={character}
        currentSessionId={currentSessionId}
        onSessionSelect={handleSessionSelect}
        onSessionCreate={handleSessionCreate}
        onSessionDelete={handleSessionDelete}
      />

      {/* 右页：对话区 + 记忆面板 */}
      <PageRight className="!p-0">
        <CandleFlame visible={recallVisible} />
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

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
        </div>

        {/* 消息列表 */}
        <MessageList
          key={`${currentSessionId}-${messageListKey}`}
          sessionId={currentSessionId}
          sessionTitle={currentSession?.title || ''}
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
          onEditAssistantMessage={handleEditAssistantMessage}
          continuingMessageId={continuingMessageId}
          continuingText={continuingText}
          onChapterChange={setFooterChapterIndex}
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

        </div>
      </PageRight>

      <StatePanel
        character={character}
        worldId={character?.world_id ?? null}
        characterId={characterId}
        persona={persona}
        recalledItems={recalledItems}
      />
    </BookSpread>
  );
}
