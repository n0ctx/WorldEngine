import { useRef, useState, useCallback, forwardRef } from 'react';
import ProximityRail from '../motion/ProximityRail.jsx';
import ProseChapters from './ProseChapters.jsx';
import MessageBubbles from './MessageBubbles.jsx';
import MessageListStatus from './MessageListStatus.jsx';
import useSessionMessages from './useSessionMessages.js';
import useMessagePaging from './useMessagePaging.js';
import useMessageDisplay from './useMessageDisplay.js';
import useMessageListHandle from './useMessageListHandle.js';

// 按消息的顶部留白定位到列表顶部
function scrollToMessageIn(list, messageId) {
  if (!list || !messageId) return;
  const target = list.querySelector(`[data-message-id="${CSS.escape(String(messageId))}"]`);
  if (!target) return;
  const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  const top = target.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop - margin;
  list.scrollTo({ top, behavior: 'smooth' });
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
  const listRef = useRef(null);
  // 翻页锚点：followLast=true 永远跟随末页（新消息到来时自动追随）；用户手动翻页后 followLast=false 停在固定页
  const [pageAnchor, setPageAnchor] = useState({ idx: 0, followLast: true });

  const {
    messages, setMessages, loading, loadError, reload, messagesRef, scrollToLatestPendingRef,
  } = useSessionMessages({ sessionId, onMessagesLoaded, setPageAnchor });

  const handleJumpToMessage = useCallback((messageId) => scrollToMessageIn(listRef.current, messageId), []);

  const {
    pageMessages, onLastPage, lastPageIdxRef,
  } = useMessagePaging({
    messages, pageAnchor, setPageAnchor, pageTurnSize, onPageInfoChange,
    generating, continuingMessageId, scrollToLatestPendingRef, listRef,
  });

  useMessageListHandle(ref, {
    setMessages,
    setPageAnchor,
    lastPageIdxRef,
    listRef,
    messagesRef,
    handleJumpToMessage,
  });

  const {
    messagesForDisplay, lastAssistantId, suppressLastFrozen, optionsStreaming, chapters, railItems,
  } = useMessageDisplay({
    messages, pageMessages, onLastPage, prose, generating, continuingMessageId,
    streamingKey, streamingText, options, chapterTurnSize,
  });

  if (loading || !sessionId || loadError) {
    return <MessageListStatus loading={loading} sessionId={sessionId} loadError={loadError} onRetry={reload} />;
  }

  return (
    <div className="relative flex-1 min-h-0">
    <div ref={listRef} className="we-chat-area absolute inset-0 overflow-y-auto px-3 pt-2 pb-4">
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
        <ProseChapters
          chapters={chapters}
          chapterTitles={chapterTitles}
          onChapterEdit={onChapterEdit}
          onChapterRetitle={onChapterRetitle}
          continuingMessageId={continuingMessageId}
          continuingText={continuingText}
          persona={persona}
          worldId={worldId}
          optionsStreaming={optionsStreaming}
          onEditMessage={onEditMessage}
          onRegenerateMessage={onRegenerateMessage}
          onEditAssistantMessage={onEditAssistantMessage}
          onDeleteMessage={onDeleteMessage}
          suppressLastFrozen={suppressLastFrozen}
          lastAssistantId={lastAssistantId}
          options={options}
          onLastPage={onLastPage}
          generating={generating}
          onSelectOption={onSelectOption}
          onDismissOptions={onDismissOptions}
          optionCollapsed={optionCollapsed}
          onOptionCollapsedChange={onOptionCollapsedChange}
        />
      ) : (
        <MessageBubbles
          messagesForDisplay={messagesForDisplay}
          continuingMessageId={continuingMessageId}
          continuingText={continuingText}
          character={character}
          persona={persona}
          worldId={worldId}
          optionsStreaming={optionsStreaming}
          onEditMessage={onEditMessage}
          onRegenerateMessage={onRegenerateMessage}
          onEditAssistantMessage={onEditAssistantMessage}
          onDeleteMessage={onDeleteMessage}
          suppressLastFrozen={suppressLastFrozen}
          lastAssistantId={lastAssistantId}
          generating={generating}
          streamingKey={streamingKey}
          streamingText={streamingText}
          onLastPage={onLastPage}
          options={options}
          onSelectOption={onSelectOption}
          onDismissOptions={onDismissOptions}
          optionCollapsed={optionCollapsed}
          onOptionCollapsedChange={onOptionCollapsedChange}
        />
      )}

    </div>
    <ProximityRail containerRef={listRef} items={railItems} onSelect={handleJumpToMessage} />

    </div>
  );
});

export default MessageList;
