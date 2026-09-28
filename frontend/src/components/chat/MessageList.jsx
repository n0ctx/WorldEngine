import { forwardRef } from 'react';
import ProximityRail from '../motion/ProximityRail.jsx';
import ProseChapters from './ProseChapters.jsx';
import MessageBubbles from './MessageBubbles.jsx';
import MessageListStatus from './MessageListStatus.jsx';
import useMessageListState from './useMessageListState.js';
import useMessageDisplay from './useMessageDisplay.js';

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
  const {
    listRef, messages, loading, loadError, reload, pageMessages, onLastPage, handleJumpToMessage,
  } = useMessageListState(ref, {
    sessionId, onMessagesLoaded, pageTurnSize, onPageInfoChange, generating, continuingMessageId,
  });

  const {
    messagesForDisplay, lastAssistantId, suppressLastFrozen, optionsStreaming, chapters, railItems,
  } = useMessageDisplay({
    messages, pageMessages, onLastPage, prose, generating, continuingMessageId,
    streamingKey, streamingText, options, chapterTurnSize,
  });
  // 只有会话以 AI 回复结尾时才能编辑它；末尾是失败残留的用户消息时后端会拒绝
  const editLastAssistant = messages.at(-1)?.role === 'assistant' ? onEditAssistantMessage : undefined;

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
          onEditAssistantMessage={editLastAssistant}
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
          onEditAssistantMessage={editLastAssistant}
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
