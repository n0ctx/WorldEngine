import { forwardRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import Button from '../ui/Button.jsx';
import IconButton from '../ui/IconButton.jsx';
import { useMotion } from '../../core/hooks/useMotion.js';
import ProximityRail from '../motion/ProximityRail.jsx';
import ChangeText from '../motion/ChangeText.jsx';
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
  onScroll,
  turnChanges = null,
}, ref) {
  const {
    listRef, messages, loading, loadError, reload, pageMessages, onLastPage,
    hasEarlierMessages, loadEarlierMessages, handleJumpToMessage,
    awayFromBottom, syncAwayFromBottom, scrollPageToBottom,
  } = useMessageListState(ref, {
    sessionId, onMessagesLoaded, pageTurnSize, onPageInfoChange, generating, continuingMessageId,
    streamingText, continuingText,
  });
  const m = useMotion();

  const {
    messagesForDisplay, lastAssistantId, suppressLastFrozen, optionsStreaming, chapters, railItems, attachedChanges,
  } = useMessageDisplay({
    messages, pageMessages, onLastPage, prose, generating, continuingMessageId,
    streamingKey, streamingText, options, chapterTurnSize, turnChanges,
  });
  // 只有会话以 AI 回复结尾时才能编辑它；末尾是失败残留的用户消息时后端会拒绝
  const editLastAssistant = messages.at(-1)?.role === 'assistant' ? onEditAssistantMessage : undefined;

  if (loading || !sessionId || loadError) {
    return <MessageListStatus loading={loading} sessionId={sessionId} loadError={loadError} onRetry={reload} />;
  }

  return (
    <div className="relative flex-1 min-h-0">
    <div ref={listRef} onScroll={(event) => { syncAwayFromBottom(event); onScroll?.(event); }} className="we-chat-area absolute inset-0 overflow-y-auto px-3 pt-2 pb-4">
      {hasEarlierMessages ? (
        <div className="text-center py-2">
          <Button type="button" variant="text" size="sm" onClick={loadEarlierMessages}>
            加载更早消息
          </Button>
        </div>
      ) : (
        messages.length > 0 && (
          <div className="text-center we-type-caption text-[var(--we-color-text-faint)] py-2">— 对话开始 —</div>
        )
      )}

      {messages.length === 0 && !generating && (
        <div className="we-chat-empty-state">
          <p className="we-chat-empty-state__text">
            <ChangeText text="开始对话吧" playKey="empty" decode />
            <span className="we-chat-empty-state__cursor" aria-hidden="true" />
          </p>
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
          turnChanges={attachedChanges}
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
          turnChanges={attachedChanges}
        />
      )}

    </div>
    <ProximityRail containerRef={listRef} items={railItems} onSelect={handleJumpToMessage} />
    <AnimatePresence>
      {awayFromBottom && (
        <div key="jump-to-bottom" className="we-chat-jump-bottom">
          <motion.div
            variants={m.variant('enter')}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={m.transition('enter')}
          >
            {/* 按下时不抢输入框焦点 */}
            <IconButton variant="secondary" label="回到底部" onMouseDown={(e) => e.preventDefault()} onClick={scrollPageToBottom}>
              <ArrowDown size={16} />
            </IconButton>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

    </div>
  );
});

export default MessageList;
