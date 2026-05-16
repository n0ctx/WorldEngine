import { useRef, useEffect, useState, useCallback, useMemo, forwardRef, useImperativeHandle, useEffectEvent } from 'react';
import { AnimatePresence } from 'framer-motion';
import MessageItem from './MessageItem.jsx';
import WritingMessageItem from '../writing/WritingMessageItem.jsx';
import OptionCard from './OptionCard.jsx';
import { getMessages } from '../../core/api/sessions.js';
import { groupMessagesIntoChapters } from '../../core/utils/chapter-grouping.js';
import ChapterDivider from './ChapterDivider.jsx';
import { log } from '../../core/utils/logger.js';

const NOOP = () => {};

function areOptionsEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * 历史冻结选项卡：已使用的选项（不可交互），支持折叠/展开。
 * 与 OptionCard 保持相同的视觉结构，在同一批次 render 中无缝接替活跃选项卡。
 */
function FrozenOptionCard({ options, selectedIndex, initialCollapsed }) {
  const [collapsed, setCollapsed] = useState(!!initialCollapsed);
  if (!options?.length) return null;
  return (
    <div className="px-4 pb-2 shrink-0">
      <div className="max-w-[800px] mx-auto">
        {collapsed ? (
          <div className="we-option-card we-option-card--collapsed we-option-card--history">
            <span className="we-option-collapsed-hint">ξ( ✿＞◡❛)</span>
            <button className="we-option-dismiss" onClick={() => setCollapsed(false)}>展开</button>
          </div>
        ) : (
          <div className="we-option-card we-option-card--history">
            <div className="flex flex-col gap-1">
              {options.map((opt, i) => (
                <div
                  key={i}
                  className={`we-option-btn we-option-btn--disabled${i === selectedIndex ? ' we-option-btn--selected' : ''}`}
                >
                  {opt}
                </div>
              ))}
            </div>
            <button className="we-option-dismiss" onClick={() => setCollapsed(true)}>折叠</button>
          </div>
        )}
      </div>
    </div>
  );
}

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
  continuingMessageId,
  continuingText,
  prose = false,
  chapterTitles = {},
  onChapterEdit,
  onChapterRetitle,
  options = [],
  onSelectOption,
  onDismissOptions,
  optionCollapsed = false,
  onOptionCollapsedChange,
  onMessagesLoaded,
  chapterTurnSize,
  pageTurnSize,
  onPageInfoChange,
}, ref) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  // 翻页锚点：followLast=true 永远跟随末页（新消息到来时自动追随）；用户手动翻页后 followLast=false 停在固定页
  const [pageAnchor, setPageAnchor] = useState({ idx: 0, followLast: true });
  const listRef = useRef(null);
  const messagesRef = useRef([]);
  const lastPageIdxRef = useRef(0);
  const handleMessagesLoaded = useEffectEvent((hydrated) => {
    onMessagesLoaded?.(hydrated);
  });
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const handleJumpToMessage = useCallback((messageId) => {
    const el = listRef.current;
    if (!el || !messageId) return;
    const target = el.querySelector(`[data-message-id="${CSS.escape(String(messageId))}"]`);
    if (!target) return;
    const top = target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    el.scrollTo({ top, behavior: 'smooth' });
  }, []);

  // 初始加载
  useEffect(() => {
    let cancelled = false;
    // 切换 session 必须重置翻页锚点，避免沿用旧会话的页码停在中间历史；与异步加载耦合，无法外提
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageAnchor({ idx: 0, followLast: true });

    if (!sessionId) {
      const timeoutId = setTimeout(() => {
        if (cancelled) return;
        setMessages([]);
        setLoadError(null);
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
      setLoadError(null);
      setMessages([]);

      try {
        const msgs = await getMessages(sessionId);
        if (cancelled) return;
        const hydrated = msgs.map((m) => (
          m.role === 'assistant' && Array.isArray(m.next_options) && m.next_options.length > 0
            ? { ...m, _options: m.next_options, _options_collapsed: true }
            : m
        ));
        setMessages(hydrated);
        setLoading(false);
        handleMessagesLoaded(hydrated);
        // 全量加载完毕：定位到最后一条消息。double rAF 跨过 commit 等到 paint。
        const scrollToLatest = () => {
          const el = listRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        };
        requestAnimationFrame(() => requestAnimationFrame(scrollToLatest));
      } catch (err) {
        if (!cancelled) {
          setLoading(false);
          setLoadError('消息加载失败，请重试');
          log.error('chat.messages.load_failed', err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, reloadToken]);


  useImperativeHandle(ref, () => ({
    appendMessage: (msg) => setMessages((prev) => [...prev, msg]),
    updateMessages: (updater) => setMessages(updater),
    setPage: (idx) => {
      const safe = Number.isFinite(idx) ? Math.max(0, Math.floor(idx)) : 0;
      setPageAnchor({ idx: safe, followLast: safe >= (lastPageIdxRef.current ?? 0) });
    },
    freezeOptions: (frozenOptions, selectedIndex, collapsed) => {
      setMessages((prev) => {
        const idx = [...prev].reverse().findIndex((m) => m.role === 'assistant');
        if (idx === -1) return prev;
        const realIdx = prev.length - 1 - idx;
        const updated = [...prev];
        updated[realIdx] = {
          ...updated[realIdx],
          _options: frozenOptions,
          _selectedOption: selectedIndex,
          _options_collapsed: collapsed,
        };
        return updated;
      });
    },
    scrollToBottom: () => {
      // 外部生成新消息/继续等场景：先切回末页（若不在末页），再滚到底
      setPageAnchor({ idx: 0, followLast: true });
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    },
    scrollPageToBottom: () => {
      // 用户点"跳转到底部"：留在当前页，仅把滚动容器拖到底
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    },
    scrollToMessage: handleJumpToMessage,
    get messagesRef() {
      return messagesRef;
    },
  }));

  // 翻页：按 pageTurnSize*2 条切片，每次只渲染当前页消息（不是滚动）
  const pageSize = useMemo(() => {
    const turn = Number(pageTurnSize);
    return (Number.isFinite(turn) && turn > 0 ? Math.floor(turn) : 50) * 2;
  }, [pageTurnSize]);
  const totalPages = Math.max(1, Math.ceil(messages.length / pageSize));
  const lastPageIdx = totalPages - 1;
  const currentPage = pageAnchor.followLast ? lastPageIdx : Math.min(pageAnchor.idx, lastPageIdx);
  const notifyPageInfo = useEffectEvent((info) => onPageInfoChange?.(info));
  useEffect(() => {
    lastPageIdxRef.current = lastPageIdx;
    notifyPageInfo({ totalPages, currentPage });
  }, [totalPages, currentPage, lastPageIdx]);
  const pageMessages = useMemo(() => {
    if (messages.length === 0) return messages;
    const start = currentPage * pageSize;
    return messages.slice(start, start + pageSize);
  }, [messages, currentPage, pageSize]);
  const onLastPage = currentPage === lastPageIdx;

  // 生成新一轮（流式 / 继续写）时强制跟随末页，避免用户停在旧页时新消息看不见
  // 同步外部生成状态到分页锚点，属 effect 合法用途；规则误报，显式豁免
  useEffect(() => {
    if (generating || continuingMessageId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPageAnchor((prev) => (prev.followLast ? prev : { idx: 0, followLast: true }));
    }
  }, [generating, continuingMessageId]);

  // 翻页后一律贴顶（包括末页），从该页第一条开始读。贴底场景由 scrollToBottom imperative 显式处理（初次加载、流式结束、用户点跳底按钮）。
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      const node = listRef.current;
      if (!node) return;
      node.scrollTop = 0;
    });
  }, [currentPage]);

  const messagesForDisplay = useMemo(() => {
    // streaming 仅在末页（followLast 语义）追加，翻到旧页时不展示
    if (!prose || !generating || !!continuingMessageId || !onLastPage) return pageMessages;
    const lastMsg = pageMessages[pageMessages.length - 1];
    const fakeTs = (lastMsg?.created_at ?? 0) + 1;
    return [
      ...pageMessages,
      {
        _key: streamingKey || '__streaming__',
        id: streamingKey || '__streaming__',
        role: 'assistant',
        content: streamingText || '',
        _isStream: true,
        created_at: fakeTs,
      },
    ];
  }, [prose, pageMessages, onLastPage, generating, continuingMessageId, streamingKey, streamingText]);

  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i].id;
    }
    return null;
  }, [messages]);
  const lastAssistantFrozenOptions = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant') return Array.isArray(msg._options) ? msg._options : [];
    }
    return [];
  }, [messages]);
  const suppressLastFrozen = options.length > 0 && areOptionsEqual(options, lastAssistantFrozenOptions);

  // 章节按全局 messages 分（保留稳定 chapterIndex），再投影出当前页可见的章节子集；末页 streaming stub 单独并入末章
  const chapters = useMemo(() => {
    if (!prose) return [];
    const globalChapters = groupMessagesIntoChapters(messages, chapterTurnSize);
    if (globalChapters.length === 0) return globalChapters;
    // 必须按 m.id 建集合：onUserSaved 后用户消息 id=realId/_key=tempId、appendMessage 后助手 id=realId/_key=streamKey；用 _key 会与下面 ch.messages.filter(m=>visibleIds.has(m.id)) 错位导致整条消息被过滤
    const visibleIds = new Set(messagesForDisplay.map((m) => m.id));
    const streamStub = messagesForDisplay.find((m) => m._isStream) || null;
    const visible = globalChapters
      .map((ch) => ({ ...ch, messages: ch.messages.filter((m) => visibleIds.has(m.id)) }))
      .filter((ch) => ch.messages.length > 0);
    if (streamStub && visible.length > 0) {
      visible[visible.length - 1].messages = [...visible[visible.length - 1].messages, streamStub];
    }
    return visible;
  }, [prose, messages, messagesForDisplay, chapterTurnSize]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--we-color-text-secondary)] opacity-50 text-sm">
        加载中…
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--we-color-text-secondary)] opacity-40 text-sm">
        请选择或创建一个对话
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-[var(--we-color-text-danger)]">{loadError}</p>
        <button
          type="button"
          className="we-panel-card-action we-panel-card-action--chip"
          onClick={() => setReloadToken((token) => token + 1)}
        >
          重试
        </button>
      </div>
    );
  }


  return (
    <div className="relative flex-1 min-h-0">
    <div ref={listRef} className="we-chat-area absolute inset-0 overflow-y-auto px-3 py-4">
      {messages.length > 0 && (
        <div className="text-center text-xs opacity-25 py-2">— 对话开始 —</div>
      )}

      {messages.length === 0 && !generating && (
        <div className="we-chat-empty-state">
          <span className="we-chat-empty-state__ornament" aria-hidden="true">❦</span>
          <p className="we-chat-empty-state__text">开始对话吧</p>
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
                  <div key={msg._key ?? msg.id}>
                    <WritingMessageItem
                      message={displayMsg}
                      isStreaming={isContinuing || isStream}
                      persona={persona}
                      worldId={worldId}
                      onEdit={isStream ? undefined : onEditMessage}
                      onRegenerate={isStream ? undefined : onRegenerateMessage}
                      onEditAssistant={isStream ? undefined : onEditAssistantMessage}
                      onDelete={isStream ? undefined : onDeleteMessage}
                    />
                    {displayMsg._options?.length > 0 && !isStream && !(suppressLastFrozen && msg.id === lastAssistantId) && (
                      <FrozenOptionCard
                        options={displayMsg._options}
                        selectedIndex={displayMsg._selectedOption}
                        initialCollapsed={displayMsg._options_collapsed}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
          })}
          {options.length > 0 && (
            <OptionCard
              options={options}
              streaming={generating}
              onSelect={onSelectOption}
              onDismiss={onDismissOptions}
              initialCollapsed={optionCollapsed}
              onCollapsedChange={onOptionCollapsedChange}
            />
          )}
        </div>
      ) : (
        <div>
          <AnimatePresence mode="popLayout">
            {(() => {
              const items = [];
              messagesForDisplay.forEach((msg, msgIdx) => {
                const isContinuing = continuingMessageId && msg.id === continuingMessageId;
                const isStream = !!msg._isStream;
                const displayMsg = isContinuing
                  ? { ...msg, content: msg.content + '\n\n' + continuingText }
                  : msg;
                items.push(
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
                    isGreeting={msgIdx === 0 && msg.role === 'assistant' && !isStream}
                  />
                );
                if (displayMsg._options?.length > 0 && !isStream && !(suppressLastFrozen && msg.id === lastAssistantId)) {
                  items.push(
                    <FrozenOptionCard
                      key={`fo-${msg._key ?? msg.id}`}
                      options={displayMsg._options}
                      selectedIndex={displayMsg._selectedOption}
                      initialCollapsed={displayMsg._options_collapsed}
                    />
                  );
                }
              });
              if (generating && !continuingMessageId && onLastPage) {
                items.push(
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
                );
              }
              return items;
            })()}
          </AnimatePresence>
          {options.length > 0 && (
            <OptionCard
              options={options}
              streaming={generating}
              onSelect={onSelectOption}
              onDismiss={onDismissOptions}
              initialCollapsed={optionCollapsed}
              onCollapsedChange={onOptionCollapsedChange}
            />
          )}
        </div>
      )}

    </div>

    </div>
  );
});

export default MessageList;
