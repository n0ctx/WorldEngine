import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getWorld } from '../api/worlds.js';
import {
  listWritingSessions,
  createWritingSession,
  listMessages,
  listActiveCharacters,
  generate,
  stopGeneration,
  continueGeneration,
} from '../api/writingSessions.js';
import WritingSidebar from '../components/writing/WritingSidebar.jsx';
import WritingMessageList from '../components/writing/WritingMessageList.jsx';
import MultiCharacterMemoryPanel from '../components/writing/MultiCharacterMemoryPanel.jsx';

export default function WritingSpacePage() {
  const { worldId } = useParams();

  const [world, setWorld] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [activeCharacters, setActiveCharacters] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [rightOpen, setRightOpen] = useState(true);
  const [inputText, setInputText] = useState('');
  const [error, setError] = useState(null);

  const stopRef = useRef(null);
  const streamingTextRef = useRef('');
  const textareaRef = useRef(null);

  // 加载世界信息
  useEffect(() => {
    if (!worldId) return;
    getWorld(worldId).then(setWorld).catch(console.error);
  }, [worldId]);

  // 初始化：加载或自动创建第一个会话
  useEffect(() => {
    if (!worldId) return;
    listWritingSessions(worldId).then((sessions) => {
      if (sessions.length > 0) {
        enterSession(sessions[0]);
      } else {
        createWritingSession(worldId).then(enterSession).catch(console.error);
      }
    }).catch(console.error);
  }, [worldId]);

  async function enterSession(session) {
    setCurrentSession(session);
    setGenerating(false);
    setStreamingText('');
    streamingTextRef.current = '';
    setError(null);

    // 加载消息
    try {
      const msgs = await listMessages(worldId, session.id);
      setMessages(msgs);
    } catch (e) {
      console.error(e);
      setMessages([]);
    }

    // 加载激活角色
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
    if (currentSession?.id === deletedId) {
      if (remaining.length > 0) {
        enterSession(remaining[0]);
      } else {
        createWritingSession(worldId).then(enterSession).catch(console.error);
      }
    }
  }

  function handleStop() {
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
    }
    stopGeneration(worldId, currentSession?.id).catch(console.error);
  }

  function handleGenerate() {
    if (!currentSession) return;
    if (generating) return;

    const prompt = inputText.trim();
    setInputText('');
    setError(null);

    // 若有用户输入，立即乐观插入 user 消息到列表
    if (prompt) {
      const optimisticUserMsg = {
        id: `__optimistic_user_${Date.now()}`,
        role: 'user',
        content: prompt,
        created_at: Date.now(),
      };
      setMessages((prev) => [...prev, optimisticUserMsg]);
    }

    setGenerating(true);
    setStreamingText('');
    streamingTextRef.current = '';

    stopRef.current = generate(worldId, currentSession.id, prompt, {
      onDelta(delta) {
        streamingTextRef.current += delta;
        setStreamingText(streamingTextRef.current);
      },
      onDone() {
        // 生成完成，重新从服务器加载消息（以替换乐观消息和流式消息）
        listMessages(worldId, currentSession.id)
          .then((msgs) => {
            setMessages(msgs);
            setGenerating(false);
            setStreamingText('');
            streamingTextRef.current = '';
          })
          .catch(console.error);
        stopRef.current = null;
      },
      onAborted() {
        listMessages(worldId, currentSession.id)
          .then((msgs) => {
            setMessages(msgs);
            setGenerating(false);
            setStreamingText('');
            streamingTextRef.current = '';
          })
          .catch(console.error);
        stopRef.current = null;
      },
      onError(msg) {
        setError(msg);
        setGenerating(false);
        setStreamingText('');
        streamingTextRef.current = '';
        stopRef.current = null;
      },
      onTitleUpdated(title) {
        setCurrentSession((prev) => prev ? { ...prev, title } : prev);
        WritingSidebar.updateTitle?.(currentSession.id, title);
      },
      onStreamEnd() {
        // 标题在 onDone 后可能才到，最终清理
        setGenerating(false);
        stopRef.current = null;
      },
    });
  }

  function handleContinue() {
    if (!currentSession) return;
    if (generating) return;

    setError(null);
    setGenerating(true);
    setStreamingText('');
    streamingTextRef.current = '';

    stopRef.current = continueGeneration(worldId, currentSession.id, {
      onDelta(delta) {
        streamingTextRef.current += delta;
        setStreamingText(streamingTextRef.current);
      },
      onDone() {
        listMessages(worldId, currentSession.id)
          .then((msgs) => {
            setMessages(msgs);
            setGenerating(false);
            setStreamingText('');
            streamingTextRef.current = '';
          })
          .catch(console.error);
        stopRef.current = null;
      },
      onAborted() {
        listMessages(worldId, currentSession.id)
          .then((msgs) => {
            setMessages(msgs);
            setGenerating(false);
            setStreamingText('');
            streamingTextRef.current = '';
          })
          .catch(console.error);
        stopRef.current = null;
      },
      onError(msg) {
        setError(msg);
        setGenerating(false);
        setStreamingText('');
        streamingTextRef.current = '';
        stopRef.current = null;
      },
      onStreamEnd() {
        setGenerating(false);
        stopRef.current = null;
      },
    });
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  }

  // 续写按钮：当最后一条是 assistant 消息时显示
  const hasAssistantMessages = messages.some((m) => m.role === 'assistant');

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* 左侧边栏 */}
      <div className="we-sidebar w-[260px] flex-none border-r border-border">
        <WritingSidebar
          worldId={worldId}
          worldName={world?.name}
          currentSessionId={currentSession?.id}
          onSessionSelect={enterSession}
          onSessionCreate={handleSessionCreate}
          onSessionDelete={handleSessionDelete}
        />
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部栏 */}
        <div className="h-12 border-b border-border flex items-center px-4 gap-2 flex-none">
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.8"
            className="text-clay opacity-60"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <span className="text-sm text-text-secondary">
            {currentSession?.title || '写作空间'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setRightOpen((v) => !v)}
              className="text-text-secondary opacity-60 hover:opacity-100 transition-opacity"
              title={rightOpen ? '收起记忆面板' : '展开记忆面板'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="15" y1="3" x2="15" y2="21" />
              </svg>
            </button>
          </div>
        </div>

        {/* 消息区 */}
        <WritingMessageList
          messages={messages}
          isGenerating={generating}
          streamingText={streamingText}
        />

        {/* 错误提示 */}
        {error && (
          <div className="px-6 py-2 text-center">
            <span className="text-xs text-red-400 bg-red-50 px-3 py-1 rounded">{error}</span>
          </div>
        )}

        {/* 输入区 */}
        <div className="border-t border-border px-4 py-3 flex-none">
          <div className="max-w-2xl mx-auto">
            <div className="relative rounded-xl border border-border bg-surface focus-within:border-clay/40 transition-colors shadow-sm">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入提示词或旁白指令… (Enter 生成，Shift+Enter 换行)"
                disabled={generating}
                rows={3}
                className="w-full resize-none bg-transparent text-sm text-text placeholder:text-text-secondary/40 px-4 pt-3 pb-10 focus:outline-none"
              />
              <div className="absolute bottom-2 right-2 flex items-center gap-2">
                {hasAssistantMessages && !generating && (
                  <button
                    onClick={handleContinue}
                    className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:bg-sand hover:text-text transition-colors"
                  >
                    续写
                  </button>
                )}
                {generating ? (
                  <button
                    onClick={handleStop}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                  >
                    停止
                  </button>
                ) : (
                  <button
                    onClick={handleGenerate}
                    className="text-xs px-3 py-1.5 rounded-lg bg-clay text-white hover:bg-clay/80 transition-colors"
                  >
                    生成
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧记忆面板 */}
      {rightOpen && (
        <div className="w-[300px] flex-none border-l border-border overflow-hidden">
          <MultiCharacterMemoryPanel
            worldId={worldId}
            sessionId={currentSession?.id}
            activeCharacters={activeCharacters}
          />
        </div>
      )}
    </div>
  );
}
