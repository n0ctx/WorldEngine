import { AnimatePresence } from 'framer-motion';
import MessageItem from './MessageItem.jsx';
import OptionCard from './OptionCard.jsx';
import FrozenOptionCard from './FrozenOptionCard.jsx';

const NOOP = () => {};

export default function MessageBubbles({
  messagesForDisplay,
  continuingMessageId,
  continuingText,
  character,
  persona,
  worldId,
  optionsStreaming,
  onEditMessage,
  onRegenerateMessage,
  onEditAssistantMessage,
  onDeleteMessage,
  suppressLastFrozen,
  lastAssistantId,
  generating,
  streamingKey,
  streamingText,
  onLastPage,
  options,
  onSelectOption,
  onDismissOptions,
  optionCollapsed,
  onOptionCollapsedChange,
}) {
  return (
    <div className="we-message-list">
      {/* initial={false}：历史消息随列表一起出现，不成片入场；只有之后新加入的消息做入场 */}
      <AnimatePresence mode="popLayout" initial={false}>
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
                showCaret={!optionsStreaming}
                streamingText={(isContinuing || isStream) ? displayMsg.content : undefined}
                onEdit={onEditMessage}
                onRegenerate={onRegenerateMessage}
                onEditAssistant={msg.id === lastAssistantId ? onEditAssistantMessage : undefined}
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
                showCaret={!optionsStreaming}
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
      {options.length > 0 && onLastPage && (
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
  );
}
