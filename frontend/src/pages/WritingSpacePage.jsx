import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getWorld } from '../api/worlds.js';
import { syncDiaryTimeField } from '../api/world-state-fields.js';
import { useAppModeStore } from '../store/appMode.js';
import { SETTINGS_MODE } from '../components/settings/SettingsConstants';
import { refreshCustomCss } from '../api/custom-css-snippets.js';
import { getPersona } from '../api/personas.js';
import {
  listWritingSessions,
  createWritingSession,
  listActiveCharacters,
  generate,
  stopGeneration,
  continueGeneration,
  regenerateWriting,
  editAndRegenerateWriting,
  editWritingAssistantMessage,
  impersonateWriting,
  retitleWritingSession,
} from '../api/writing-sessions.js';
import { getChapterTitles, updateChapterTitle, retitleChapter } from '../api/chapter-titles.js';
import { deleteMessage as deleteMessageApi } from '../api/sessions.js';
import WritingPageLeft from '../components/book/WritingPageLeft.jsx';
import CastPanel from '../components/book/CastPanel.jsx';
import MessageList from '../components/chat/MessageList.jsx';
import InputBox from '../components/chat/InputBox.jsx';
import WritingSessionList from '../components/book/WritingSessionList.jsx';
import OptionCard from '../components/chat/OptionCard.jsx';

export default function WritingSpacePage() {
  const { worldId } = useParams();
  const setAppMode = useAppModeStore((s) => s.setAppMode);

  useEffect(() => {
    setAppMode(SETTINGS_MODE.WRITING);
    refreshCustomCss(SETTINGS_MODE.WRITING);
    return () => {
      setAppMode(SETTINGS_MODE.CHAT);
      refreshCustomCss(SETTINGS_MODE.CHAT);
    };
  }, [setAppMode]);

  const [world, setWorld] = useState(null);
  const [persona, setPersona] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [activeCharacters, setActiveCharacters] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingKey, setStreamingKey] = useState('__ws_stream_init__');
  const [continuingMessageId, setContinuingMessageId] = useState(null);
  const [continuingText, setContinuingText] = useState('');
  const [impersonating, setImpersonating] = useState(false);
  const [castRefreshTick, setCastRefreshTick] = useState(0);
  const [messageListKey, setMessageListKey] = useState(0);
  const [error, setError] = useState(null);

  const inputBoxRef = useRef(null);
  const stopRef = useRef(null);
  const streamingTextRef = useRef('');
  const streamingKeyRef = useRef('__ws_stream_init__');
  const continuingMessageIdRef = useRef(null);
  const continuingTextRef = useRef('');
  const pendingAssistantRef = useRef(null);
  const assistantAppendedEarlyRef = useRef(false);
  const pendingOptionsRef = useRef([]);
  const currentSessionRef = useRef(null);

  const [currentOptions, setCurrentOptions] = useState([]);
  const [pendingDiaryInject, setPendingDiaryInject] = useState(null);
  // chapterTitles: { [chapterIndex]: { title, is_default } }
  const [chapterTitles, setChapterTitles] = useState({});

  function clearOptionsState() {
    pendingOptionsRef.current = [];
    setCurrentOptions([]);
  }

  useEffect(() => {
    currentSessionRef.current = currentSession;
  }, [currentSession]);

  useEffect(() => {
    if (!worldId) return;
    clearOptionsState();
    getWorld(worldId).then(setWorld).catch(console.error);
    getPersona(worldId).then(setPersona).catch(() => {});
    syncDiaryTimeField(worldId).catch(() => {});
  }, [worldId]);

  useEffect(() => {
    return () => {
      clearOptionsState();
    };
  }, []);

  // 初始化：加载或自动创建第一个会话
  useEffect(() => {
    if (!worldId) return;
    listWritingSessions(worldId).then((sessions) => {
      if (sessions.length > 0) {
        enterSession(sessions[0]);
      } else {
        createWritingSession(worldId).then((s) => {
          WritingSessionList.addSession?.(s);
          enterSession(s);
        }).catch(console.error);
      }
    }).catch(console.error);
  }, [worldId]);

  function refreshMessages() {
    setMessageListKey((k) => k + 1);
  }

  async function enterSession(session) {
    clearOptionsState();
    setCurrentSession(session);
    setGenerating(false);
    setStreamingText('');
    streamingTextRef.current = '';
    continuingMessageIdRef.current = null;
    continuingTextRef.current = '';
    setContinuingMessageId(null);
    setContinuingText('');
    setError(null);
    setChapterTitles({});
    refreshMessages();

    try {
      const chars = await listActiveCharacters(worldId, session.id);
      setActiveCharacters(chars);
    } catch (e) {
      console.error(e);
      setActiveCharacters([]);
    }

    // 加载章节标题（异步，不阻塞进入会话）
    getChapterTitles(worldId, session.id)
      .then((arr) => {
        const map = {};
        for (const row of arr) map[row.chapter_index] = { title: row.title, is_default: row.is_default };
        setChapterTitles(map);
      })
      .catch(console.error);
  }

  function handleSessionCreate(session) {
    enterSession(session);
  }

  function handleSessionDelete(deletedId, remaining) {
    if (currentSessionRef.current?.id === deletedId) {
      if (remaining.length > 0) {
        enterSession(remaining[0]);
      } else {
        createWritingSession(worldId).then((s) => {
          WritingSessionList.addSession?.(s);
          enterSession(s);
        }).catch(console.error);
      }
    }
  }

  function handleStop() {
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
    }
    stopGeneration(worldId, currentSessionRef.current?.id).catch(console.error);
  }

  function beginStreamingKey() {
    const k = `__ws_stream_${Date.now()}_${Math.random().toString(36).slice(2, 7)}__`;
    streamingKeyRef.current = k;
    setStreamingKey(k);
    return k;
  }

  function makeStreamCallbacks() {
    pendingAssistantRef.current = null;
    assistantAppendedEarlyRef.current = false;
    clearOptionsState();
    const streamKey = beginStreamingKey();
    return {
      onDelta(delta) {
        const next = streamingTextRef.current + delta;
        streamingTextRef.current = next;
        const tagIdx = next.indexOf('<next_prompt>');
        if (tagIdx !== -1) {
          setStreamingText(next.slice(0, tagIdx));
          const afterTag = next.slice(tagIdx + '<next_prompt>'.length);
          const opts = afterTag.split('\n').map((s) => s.trim()).filter((s) => s && s !== '</next_prompt>');
          setCurrentOptions(opts);
        } else {
          setStreamingText(next);
        }
      },
      onDone(assistant, options) {
        if (options?.length) pendingOptionsRef.current = options;
        // 立即追加真实消息 + 解锁输入框（同批次渲染），避免流式占位消失后真实消息延迟出现的闪烁
        if (assistant && MessageList.appendMessage) {
          MessageList.appendMessage({ ...assistant, _key: streamKey });
          assistantAppendedEarlyRef.current = true;
        } else if (assistant) {
          pendingAssistantRef.current = assistant;
        }
        setGenerating(false);
      },
      onAborted(assistant) {
        if (assistant) pendingAssistantRef.current = assistant;
      },
      onError(msg) {
        setError(msg);
        streamingTextRef.current = '';
        setGenerating(false);
        setStreamingText('');
        stopRef.current = null;
      },
      onTitleUpdated(title) {
        setCurrentSession((prev) => prev ? { ...prev, title } : prev);
        WritingSessionList.updateTitle?.(currentSessionRef.current?.id, title);
      },
      onChapterTitleUpdated(chapterIndex, title) {
        setChapterTitles((prev) => ({ ...prev, [chapterIndex]: { title, is_default: 0 } }));
      },
      onStreamEnd() {
        const pending = pendingAssistantRef.current;
        pendingAssistantRef.current = null;
        const alreadyAppended = assistantAppendedEarlyRef.current;
        assistantAppendedEarlyRef.current = false;
        const pendingOptions = pendingOptionsRef.current;
        pendingOptionsRef.current = [];
        streamingTextRef.current = '';
        setGenerating(false);
        setStreamingText('');
        stopRef.current = null;
        setCastRefreshTick((t) => t + 1);
        if (pendingOptions?.length > 0) setCurrentOptions(pendingOptions);
        if (!alreadyAppended) {
          if (pending && MessageList.appendMessage) {
            // 用与流式占位相同的 _key，React 视为同一节点，避免 unmount+mount 闪烁
            MessageList.appendMessage({ ...pending, _key: streamKey });
          } else {
            refreshMessages();
          }
        }
      },
    };
  }

  function handleSend(content) {
    const session = currentSessionRef.current;
    if (!session || generating) return;

    setError(null);
    clearOptionsState();

    if (content) {
      const optimisticMsg = {
        id: `__optimistic_${Date.now()}`,
        session_id: session.id,
        role: 'user',
        content,
        attachments: null,
        created_at: Date.now(),
      };
      if (MessageList.appendMessage) MessageList.appendMessage(optimisticMsg);
    }

    setGenerating(true);
    setStreamingText('');
    streamingTextRef.current = '';
    const inject = pendingDiaryInject;
    setPendingDiaryInject(null);
    stopRef.current = generate(worldId, session.id, content || '', makeStreamCallbacks(), inject ? { diaryInjection: inject } : {});
  }

  function handleEditMessage(messageId, newContent) {
    const session = currentSessionRef.current;
    if (!session || generating) return;
    setError(null);
    if (MessageList.updateMessages) {
      MessageList.updateMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === messageId);
        if (idx === -1) return prev;
        return [...prev.slice(0, idx), { ...prev[idx], content: newContent }];
      });
    }
    setGenerating(true);
    setStreamingText('');
    streamingTextRef.current = '';
    stopRef.current = editAndRegenerateWriting(worldId, session.id, messageId, newContent, makeStreamCallbacks());
  }

  function handleRegenerateMessage(assistantMessageId) {
    const session = currentSessionRef.current;
    if (!session || generating) return;
    setError(null);
    const msgs = MessageList.messagesRef?.current ?? [];
    const idx = msgs.findIndex((m) => m.id === assistantMessageId);
    if (idx <= 0) return;
    const afterMessageId = msgs[idx - 1].id;
    MessageList.updateMessages?.((prev) => {
      const i = prev.findIndex((m) => m.id === assistantMessageId);
      return i >= 0 ? prev.slice(0, i) : prev;
    });
    setGenerating(true);
    setStreamingText('');
    streamingTextRef.current = '';
    stopRef.current = regenerateWriting(worldId, session.id, afterMessageId, makeStreamCallbacks());
  }

  async function handleEditAssistantMessage(messageId, newContent) {
    if (generating) return;
    const session = currentSessionRef.current;
    if (!session) return;
    if (MessageList.updateMessages) {
      MessageList.updateMessages((prev) =>
        prev.map((m) => m.id === messageId ? { ...m, content: newContent } : m)
      );
    }
    try {
      await editWritingAssistantMessage(worldId, session.id, messageId, newContent);
    } catch (err) {
      setError(err.message || '保存失败');
      refreshMessages();
    }
  }

  async function handleDeleteMessage(messageId) {
    if (generating) return;
    const session = currentSessionRef.current;
    if (!session) return;
    try {
      await deleteMessageApi(session.id, messageId);
      if (MessageList.updateMessages) {
        MessageList.updateMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === messageId);
          if (idx === -1) return prev;
          return prev.slice(0, idx);
        });
      }
      setCastRefreshTick((t) => t + 1);
    } catch (err) {
      setError(err.message || '删除失败');
    }
  }

  function handleContinue() {
    const session = currentSessionRef.current;
    if (!session || generating) return;

    clearOptionsState();

    // 找最后一条 assistant 消息 id
    let lastAssistantId = null;
    if (MessageList.messagesRef) {
      const msgs = MessageList.messagesRef.current ?? [];
      const last = [...msgs].reverse().find((m) => m.role === 'assistant');
      if (last) lastAssistantId = last.id;
    }
    if (!lastAssistantId) return;

    setError(null);
    continuingMessageIdRef.current = lastAssistantId;
    continuingTextRef.current = '';
    setContinuingMessageId(lastAssistantId);
    setContinuingText('');
    setGenerating(true);

    stopRef.current = continueGeneration(worldId, session.id, {
      onDelta(delta) {
        continuingTextRef.current += delta;
        setContinuingText((prev) => prev + delta);
      },
      onDone() {
        setGenerating(false);
      },
      onAborted() {
        // 合并续写内容到消息列表后清理
        const contId = continuingMessageIdRef.current;
        const contText = continuingTextRef.current;
        if (contId && contText && MessageList.updateMessages) {
          MessageList.updateMessages((prev) =>
            prev.map((m) => m.id === contId ? { ...m, content: m.content + '\n\n' + contText.replace(/^\n+/, '') } : m)
          );
        }
        continuingMessageIdRef.current = null;
        continuingTextRef.current = '';
        setContinuingMessageId(null);
        setContinuingText('');
        setGenerating(false);
        stopRef.current = null;
      },
      onError(msg) {
        setError(msg);
        continuingMessageIdRef.current = null;
        continuingTextRef.current = '';
        setContinuingMessageId(null);
        setContinuingText('');
        setGenerating(false);
        stopRef.current = null;
      },
      onStreamEnd() {
        // 合并续写内容到消息列表后清理
        const contId = continuingMessageIdRef.current;
        const contText = continuingTextRef.current;
        if (contId && contText && MessageList.updateMessages) {
          MessageList.updateMessages((prev) =>
            prev.map((m) => m.id === contId ? { ...m, content: m.content + '\n\n' + contText.replace(/^\n+/, '') } : m)
          );
        }
        continuingMessageIdRef.current = null;
        continuingTextRef.current = '';
        setContinuingMessageId(null);
        setContinuingText('');
        setGenerating(false);
        stopRef.current = null;
        setCastRefreshTick((t) => t + 1);
      },
    });
  }

  async function handleImpersonate() {
    const session = currentSessionRef.current;
    if (!session || generating || impersonating) return;
    setImpersonating(true);
    try {
      const { content } = await impersonateWriting(worldId, session.id);
      if (content) inputBoxRef.current?.fillText(content);
    } catch (err) {
      console.error('impersonate error:', err);
    } finally {
      setImpersonating(false);
    }
  }

  // 重新生成会话标题（修复 /title 命令）
  async function handleRetitle() {
    const session = currentSessionRef.current;
    if (!session) return;
    try {
      const { title } = await retitleWritingSession(worldId, session.id);
      if (title) {
        setCurrentSession((prev) => prev ? { ...prev, title } : prev);
        WritingSessionList.updateTitle?.(session.id, title);
      }
    } catch (err) {
      console.error('retitle error:', err);
    }
  }

  // 用户编辑章节标题（不调用 LLM）
  async function handleChapterEdit(chapterIndex, newTitle) {
    const session = currentSessionRef.current;
    if (!session) return;
    try {
      await updateChapterTitle(worldId, session.id, chapterIndex, newTitle);
      setChapterTitles((prev) => ({ ...prev, [chapterIndex]: { title: newTitle, is_default: 0 } }));
    } catch (err) {
      console.error('chapter edit error:', err);
    }
  }

  // LLM 重新生成章节标题
  async function handleChapterRetitle(chapterIndex) {
    const session = currentSessionRef.current;
    if (!session) return;
    try {
      const { title } = await retitleChapter(worldId, session.id, chapterIndex);
      if (title) {
        setChapterTitles((prev) => ({ ...prev, [chapterIndex]: { title, is_default: 0 } }));
      }
    } catch (err) {
      console.error('chapter retitle error:', err);
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--we-book-bg)' }}>
      <WritingPageLeft
        worldId={worldId}
        currentSessionId={currentSession?.id}
        onSessionSelect={enterSession}
        onSessionCreate={handleSessionCreate}
        onSessionDelete={handleSessionDelete}
      />

      {/* 中间消息区 */}
      <div
        className="we-page-right"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--we-paper-base)',
          position: 'relative',
        }}
      >
        {/* 章节标题区 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 16px 8px',
          borderBottom: '1px solid var(--we-paper-shadow)',
          flexShrink: 0,
        }}>
          {currentSession ? (
            <h1 style={{
              flex: 1,
              fontFamily: 'var(--we-font-display)',
              fontSize: 15,
              fontStyle: 'italic',
              fontWeight: 400,
              color: 'var(--we-ink-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              margin: 0,
            }}>
              {currentSession.title || '写作进行中'}
            </h1>
          ) : (
            <span style={{ flex: 1 }} />
          )}
        </div>

        {/* 消息列表 */}
        <MessageList
          key={`${currentSession?.id}-${messageListKey}`}
          sessionId={currentSession?.id}
          character={null}
          persona={persona}
          worldId={worldId}
          generating={generating}
          streamingText={streamingText}
          streamingKey={streamingKey}
          continuingMessageId={continuingMessageId}
          continuingText={continuingText}
          onEditMessage={handleEditMessage}
          onRegenerateMessage={handleRegenerateMessage}
          onEditAssistantMessage={handleEditAssistantMessage}
          onDeleteMessage={handleDeleteMessage}
          prose
          chapterTitles={chapterTitles}
          onChapterEdit={handleChapterEdit}
          onChapterRetitle={handleChapterRetitle}
        />

        {/* 选项卡：AI 回复后展示行动选项 */}
        {currentOptions.length > 0 && (
          <OptionCard
            options={currentOptions}
            streaming={generating}
            onSelect={(text) => { setCurrentOptions([]); handleSend(text); }}
            onDismiss={() => setCurrentOptions([])}
          />
        )}

        {/* 错误提示 */}
        {error && (
          <div style={{ padding: '6px 16px', flexShrink: 0 }}>
            <span style={{
              fontSize: 12, fontFamily: 'var(--we-font-serif)',
              color: 'var(--we-vermilion)',
              background: 'var(--we-vermilion-bg)',
              border: '1px solid var(--we-vermilion)',
              borderRadius: 'var(--we-radius-sm)',
              padding: '3px 10px',
              display: 'inline-block',
            }}>
              生成失败：{error}
            </span>
          </div>
        )}

        {/* 输入区 */}
        <InputBox
          ref={inputBoxRef}
          onSend={handleSend}
          onStop={handleStop}
          generating={generating}
          impersonating={impersonating}
          lastUserContent=""
          worldId={worldId}
          onContinue={handleContinue}
          onImpersonate={handleImpersonate}
          onTitle={handleRetitle}
        />
      </div>

      <CastPanel
        worldId={worldId}
        sessionId={currentSession?.id}
        activeCharacters={activeCharacters}
        onActiveCharactersChange={setActiveCharacters}
        refreshTick={castRefreshTick}
        persona={persona}
        onDiaryInject={setPendingDiaryInject}
      />
    </div>
  );
}
