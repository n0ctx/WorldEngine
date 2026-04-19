import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import MessageItem from './MessageItem.jsx';
import WritingMessageItem from '../writing/WritingMessageItem.jsx';
import { getMessages } from '../../api/sessions.js';
import { groupMessagesIntoChapters } from '../../utils/chapter-grouping.js';
import ChapterDivider from '../book/ChapterDivider.jsx';

const NOOP = () => {};

const PAGE_SIZE = 50;

export default function MessageList({
  sessionId,
  sessionTitle = '',
  character,
  persona,
  worldId,
  generating,
  streamingText,
  streamingKey,
  memoryRecalling,
  memoryExpanding,
  expandedMessage,
  onEditMessage,
  onRegenerateMessage,
  onEditAssistantMessage,
  onDeleteMessage,
  continuingMessageId,
  continuingText,
  prose = false,
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const listRef = useRef(null);
  const bottomRef = useRef(null);
  const prevScrollHeight = useRef(0);
  const messagesRef = useRef([]);
  messagesRef.current = messages;
  // 是否用户当前处于接近底部（用于决定是否自动跟随流式输出）
  const nearBottomRef = useRef(true);

  function scrollToBottom(behavior = 'smooth') {
    bottomRef.current?.scrollIntoView({ behavior });
  }

  function isNearBottom() {
    const el = listRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  // 初始加载
  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      setOffset(0);
      setHasMore(false);
      return;
    }

    setLoading(true);
    setMessages([]);
    setOffset(0);
    setHasMore(false);

    getMessages(sessionId, PAGE_SIZE, 0)
      .then((msgs) => {
        setMessages(msgs);
        setOffset(msgs.length);
        setHasMore(msgs.length === PAGE_SIZE);
        setLoading(false);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 0);
      })
      .catch(() => setLoading(false));
  }, [sessionId]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || !sessionId) return;
    setLoadingMore(true);
    const el = listRef.current;
    if (el) prevScrollHeight.current = el.scrollHeight;

    getMessages(sessionId, PAGE_SIZE, offset)
      .then((older) => {
        setMessages((prev) => [...older, ...prev]);
        setOffset((o) => o + older.length);
        setHasMore(older.length === PAGE_SIZE);
        setLoadingMore(false);
        if (el) {
          requestAnimationFrame(() => {
            el.scrollTop = el.scrollHeight - prevScrollHeight.current;
          });
        }
      })
      .catch(() => setLoadingMore(false));
  }, [loadingMore, hasMore, sessionId, offset]);

  // 监听滚动：到顶部时加载更多；记录是否接近底部
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    function handleScroll() {
      nearBottomRef.current = isNearBottom();
      if (el.scrollTop < 80 && hasMore && !loadingMore) {
        loadMore();
      }
    }

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [loadMore, hasMore, loadingMore]);

  // 新消息追加后（用户发送）滚到底部，排除"加载历史"的情况
  const prevLengthRef = useRef(0);
  useEffect(() => {
    const prev = prevLengthRef.current;
    prevLengthRef.current = messages.length;
    if (messages.length > prev && !loadingMore) {
      scrollToBottom('smooth');
      nearBottomRef.current = true;
    }
  }, [messages.length, loadingMore]);

  // 流式输出时若用户在底部附近则持续跟随
  useEffect(() => {
    if (generating && nearBottomRef.current) {
      scrollToBottom('instant');
    }
  }, [streamingText, continuingText, generating]);

  // 外部追加消息（发送后插入 user 消息）
  MessageList.appendMessage = (msg) => setMessages((prev) => [...prev, msg]);
  // 外部更新消息（编辑后）
  MessageList.updateMessages = (updater) => setMessages(updater);
  // 外部同步读取当前消息列表（避免在 updater 闭包中读取异步状态）
  MessageList.messagesRef = messagesRef;

  const messagesForDisplay = useMemo(() => {
    if (!prose || !generating || !!continuingMessageId) return messages;
    const lastMsg = messages[messages.length - 1];
    const fakeTs = (lastMsg?.created_at ?? Date.now()) + 1;
    return [
      ...messages,
      {
        _key: streamingKey || '__streaming__',
        id: streamingKey || '__streaming__',
        role: 'assistant',
        content: streamingText || '',
        _isStream: true,
        created_at: fakeTs,
      },
    ];
  }, [prose, messages, generating, continuingMessageId, streamingKey, streamingText]);

  // 章节分组仅用于写作空间（prose 模式）
  const chapters = useMemo(
    () => prose ? groupMessagesIntoChapters(messagesForDisplay, sessionTitle) : [],
    [prose, messagesForDisplay, sessionTitle]
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary opacity-50 text-sm">
        加载中…
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary opacity-40 text-sm">
        请选择或创建一个对话
      </div>
    );
  }

  return (
    <div ref={listRef} className="we-chat-area flex-1 overflow-y-auto px-3 py-4">
      {/* 加载更多指示器 */}
      {loadingMore && (
        <div className="text-center text-xs opacity-40 py-3">加载历史消息…</div>
      )}
      {!hasMore && messages.length > 0 && (
        <div className="text-center text-xs opacity-25 py-2">— 对话开始 —</div>
      )}

      {/* 记忆检索提示 */}
      {memoryRecalling && (
        <div className="flex items-center justify-center gap-2 py-3 text-xs text-accent opacity-70">
          <span className="typing-dot" style={{ background: 'var(--we-accent)' }} />
          <span className="typing-dot" style={{ background: 'var(--we-accent)' }} />
          <span className="typing-dot" style={{ background: 'var(--we-accent)' }} />
          <span className="ml-1">正在检索记忆…</span>
        </div>
      )}

      {/* 记忆原文展开提示（T28） */}
      {memoryExpanding && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-text-secondary opacity-50">
          <span className="typing-dot" style={{ background: 'var(--we-text-secondary)' }} />
          <span className="typing-dot" style={{ background: 'var(--we-text-secondary)' }} />
          <span className="typing-dot" style={{ background: 'var(--we-text-secondary)' }} />
          <span className="ml-1">正在翻阅历史对话…</span>
        </div>
      )}
      {!memoryExpanding && expandedMessage && (
        <div className="flex items-center justify-center py-2">
          <span className="text-xs text-text-secondary opacity-40 px-3 py-1 rounded-full border border-border">
            {expandedMessage}
          </span>
        </div>
      )}

      {messages.length === 0 && !generating && (
        <div className="flex items-center justify-center h-full text-text-secondary opacity-30 text-sm">
          开始对话吧
        </div>
      )}

      {prose ? (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '8px 24px 24px' }}>
          {chapters.map((chapter) => (
            <div key={chapter.chapterIndex} className="we-chapter">
              <ChapterDivider chapterIndex={chapter.chapterIndex} title={chapter.title} />
              {chapter.messages.map((msg) => {
                const isStream = !!msg._isStream;
                const isContinuing = !isStream && continuingMessageId && msg.id === continuingMessageId;
                const displayMsg = isContinuing ? { ...msg, content: msg.content + '\n\n' + continuingText } : msg;
                return (
                  <WritingMessageItem
                    key={msg._key ?? msg.id}
                    message={displayMsg}
                    isStreaming={isContinuing || isStream}
                    persona={persona}
                    onEdit={isStream ? undefined : onEditMessage}
                    onRegenerate={isStream ? undefined : onRegenerateMessage}
                    onEditAssistant={isStream ? undefined : onEditAssistantMessage}
                    onDelete={isStream ? undefined : onDeleteMessage}
                  />
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div>
          <AnimatePresence mode="popLayout">
            {messagesForDisplay.map((msg) => {
              const isContinuing = continuingMessageId && msg.id === continuingMessageId;
              const isStream = !!msg._isStream;
              const displayMsg = isContinuing
                ? { ...msg, content: msg.content + '\n\n' + continuingText }
                : msg;
              return (
                <MessageItem
                  key={msg._key ?? msg.id}
                  message={displayMsg}
                  character={character}
                  persona={persona}
                  worldId={worldId}
                  isStreaming={isContinuing || isStream}
                  streamingText={(isContinuing || isStream) ? displayMsg.content : undefined}
                  onEdit={onEditMessage}
                  onRegenerate={onRegenerateMessage}
                  onEditAssistant={onEditAssistantMessage}
                  onDelete={isStream ? undefined : onDeleteMessage}
                />
              );
            })}
            {/* 流式响应（仅新消息，续写时不显示） */}
            {generating && !continuingMessageId && (
              <MessageItem
                key={streamingKey || '__streaming__'}
                message={{ id: streamingKey || '__streaming__', role: 'assistant', content: streamingText || '', created_at: Date.now() }}
                character={character}
                worldId={worldId}
                isStreaming={true}
                streamingText={streamingText}
                onEdit={NOOP}
                onRegenerate={NOOP}
                onEditAssistant={NOOP}
              />
            )}
          </AnimatePresence>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
