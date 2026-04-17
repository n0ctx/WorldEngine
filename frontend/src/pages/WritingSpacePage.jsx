import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getWorld } from '../api/worlds.js';
import { getPersona } from '../api/personas.js';
import {
  listWritingSessions,
  createWritingSession,
  listActiveCharacters,
  generate,
  stopGeneration,
  continueGeneration,
} from '../api/writingSessions.js';
import WritingPageLeft from '../components/book/WritingPageLeft.jsx';
import CastPanel from '../components/book/CastPanel.jsx';
import MessageList from '../components/chat/MessageList.jsx';
import InputBox from '../components/chat/InputBox.jsx';
import WritingSessionList from '../components/book/WritingSessionList.jsx';

export default function WritingSpacePage() {
  const { worldId } = useParams();

  const [world, setWorld] = useState(null);
  const [persona, setPersona] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [activeCharacters, setActiveCharacters] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [messageListKey, setMessageListKey] = useState(0);
  const [error, setError] = useState(null);

  const stopRef = useRef(null);
  const streamingTextRef = useRef('');
  const currentSessionRef = useRef(null);

  useEffect(() => {
    currentSessionRef.current = currentSession;
  }, [currentSession]);

  useEffect(() => {
    if (!worldId) return;
    getWorld(worldId).then(setWorld).catch(console.error);
    getPersona(worldId).then(setPersona).catch(() => {});
  }, [worldId]);

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
    setCurrentSession(session);
    setGenerating(false);
    setStreamingText('');
    streamingTextRef.current = '';
    setError(null);
    refreshMessages();

    try {
      const chars = await listActiveCharacters(worldId, session.id);
      setActiveCharacters(chars);
    } catch (e) {
      console.error(e);
      setActiveCharacters([]);
    }
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

  function handleSend(content) {
    const session = currentSessionRef.current;
    if (!session) return;
    if (generating) return;

    setError(null);

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

    stopRef.current = generate(worldId, session.id, content || '', {
      onDelta(delta) {
        streamingTextRef.current += delta;
        setStreamingText(streamingTextRef.current);
      },
      onDone() {},
      onAborted() {
        streamingTextRef.current = '';
        setGenerating(false);
        setStreamingText('');
        stopRef.current = null;
        refreshMessages();
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
        WritingSessionList.updateTitle?.(session.id, title);
      },
      onStreamEnd() {
        streamingTextRef.current = '';
        setGenerating(false);
        setStreamingText('');
        stopRef.current = null;
        refreshMessages();
      },
    });
  }

  function handleContinue() {
    const session = currentSessionRef.current;
    if (!session) return;
    if (generating) return;

    setError(null);
    setGenerating(true);
    setStreamingText('');
    streamingTextRef.current = '';

    stopRef.current = continueGeneration(worldId, session.id, {
      onDelta(delta) {
        streamingTextRef.current += delta;
        setStreamingText(streamingTextRef.current);
      },
      onDone() {},
      onAborted() {
        streamingTextRef.current = '';
        setGenerating(false);
        setStreamingText('');
        stopRef.current = null;
        refreshMessages();
      },
      onError(msg) {
        setError(msg);
        streamingTextRef.current = '';
        setGenerating(false);
        setStreamingText('');
        stopRef.current = null;
      },
      onStreamEnd() {
        streamingTextRef.current = '';
        setGenerating(false);
        setStreamingText('');
        stopRef.current = null;
        refreshMessages();
      },
    });
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
          sessionTitle={currentSession?.title || ''}
          character={null}
          persona={persona}
          worldId={worldId}
          generating={generating}
          streamingText={streamingText}
        />

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
          onSend={handleSend}
          onStop={handleStop}
          generating={generating}
          lastUserContent=""
          worldId={worldId}
          onContinue={handleContinue}
        />
      </div>

      <CastPanel
        worldId={worldId}
        sessionId={currentSession?.id}
        activeCharacters={activeCharacters}
        onActiveCharactersChange={setActiveCharacters}
      />
    </div>
  );
}
