import { useRef, useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { AnimatePresence } from 'framer-motion';
import MessageItem from './MessageItem.jsx';
import WritingMessageItem from '../writing/WritingMessageItem.jsx';
import { getMessages } from '../../api/sessions.js';
import { groupMessagesIntoChapters } from '../../utils/chapter-grouping.js';
import ChapterDivider from '../book/ChapterDivider.jsx';

const NOOP = () => {};

const PAGE_SIZE = 50;

const MessageList = forwardRef(function MessageList({
  sessionId,
  character,
  persona,
  worldId,
  generating,
  streamingText,
  streamingKey,
  onEditMessage,
  onRegenerateMessage,
  onEditAssistantMessage,
  onDeleteMessage,
  onMakeCard,
  continuingMessageId,
  continuingText,
  prose = false,
  chapterTitles = {},
  onChapterEdit,
  onChapterRetitle,
}, ref) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const listRef = useRef(null);
  const prevScrollHeight = useRef(0);
  const messagesRef = useRef([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // 初始加载
  useEffect(() => {
    let cancelled = false;

    if (!sessionId) {
      const timeoutId = setTimeout(() => {
        if (cancelled) return;
        setMessages([]);
        setOffset(0);
        setHasMore(false);
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(timeoutId);
      };
    }

    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setMessages([]);
      setOffset(0);
      setHasMore(false);

      try {
        const msgs = await getMessages(sessionId, PAGE_SIZE, 0);
        if (cancelled) return;
        setMessages(msgs);
        setOffset(msgs.length);
        setHasMore(msgs.length === PAGE_SIZE);
        setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
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

  // 监听滚动：到顶部时加载更多
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    function handleScroll() {
      if (el.scrollTop < 80 && hasMore && !loadingMore) {
        loadMore();
      }
    }

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [loadMore, hasMore, loadingMore]);


  useImperativeHandle(ref, () => ({
    appendMessage: (msg) => setMessages((prev) => [...prev, msg]),
    updateMessages: (updater) => setMessages(updater),
    scrollToBottom: () => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    },
    get messagesRef() {
      return messagesRef;
    },
  }));

  const messagesForDisplay = useMemo(() => {
    if (!prose || !generating || !!continuingMessageId) return messages;
    const lastMsg = messages[messages.length - 1];
    const fakeTs = (lastMsg?.created_at ?? 0) + 1;
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

  // 章节分组仅用于写作（prose 模式）
  const chapters = useMemo(
    () => prose ? groupMessagesIntoChapters(messagesForDisplay) : [],
    [prose, messagesForDisplay]
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
    <div className="relative flex-1 min-h-0">
    <div ref={listRef} className="we-chat-area absolute inset-0 overflow-y-auto px-3 py-4">
      {/* 加载更多指示器 */}
      {loadingMore && (
        <div className="text-center text-xs opacity-40 py-3">加载历史消息…</div>
      )}
      {!hasMore && messages.length > 0 && (
        <div className="text-center text-xs opacity-25 py-2">— 对话开始 —</div>
      )}

      {messages.length === 0 && !generating && (
        <div className="flex items-center justify-center h-full text-text-secondary opacity-30 text-sm">
          开始对话吧
        </div>
      )}

      {prose ? (
        <div className="we-prose-message-list">
          {chapters.map((chapter) => {
            const ctEntry = chapterTitles[chapter.chapterIndex];
            const chapterTitle = ctEntry?.title ?? (chapter.chapterIndex === 1 ? '序章' : '续章');
            const isDefault = ctEntry ? !!ctEntry.is_default : true;
            return (
            <div key={chapter.chapterIndex} className="we-chapter">
              <ChapterDivider
                chapterIndex={chapter.chapterIndex}
                title={chapterTitle}
                isDefault={isDefault}
                onEdit={onChapterEdit ? (t) => onChapterEdit(chapter.chapterIndex, t) : undefined}
                onRegenerate={onChapterRetitle ? () => onChapterRetitle(chapter.chapterIndex) : undefined}
              />
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
                    worldId={worldId}
                    onEdit={isStream ? undefined : onEditMessage}
                    onRegenerate={isStream ? undefined : onRegenerateMessage}
                    onEditAssistant={isStream ? undefined : onEditAssistantMessage}
                    onDelete={isStream ? undefined : onDeleteMessage}
                    onMakeCard={isStream ? undefined : onMakeCard}
                  />
                );
              })}
            </div>
          );
          })}
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
                message={{ id: streamingKey || '__streaming__', role: 'assistant', content: streamingText || '', created_at: 0 }}
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

    </div>

    </div>
  );
});

export default MessageList;
