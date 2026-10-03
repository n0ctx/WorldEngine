import WritingMessageItem from '../writing/WritingMessageItem.jsx';
import OptionCard from './OptionCard.jsx';
import FrozenOptionCard from './FrozenOptionCard.jsx';
import ChapterDivider from './ChapterDivider.jsx';

const chapterTitleOf = (titles, index) => titles[index]?.title ?? (index === 1 ? '序章' : '续章');

export default function ProseChapters({
  chapters,
  chapterTitles,
  onChapterEdit,
  onChapterRetitle,
  continuingMessageId,
  continuingText,
  persona,
  worldId,
  optionsStreaming,
  onEditMessage,
  onRegenerateMessage,
  onEditAssistantMessage,
  onDeleteMessage,
  suppressLastFrozen,
  lastAssistantId,
  options,
  onLastPage,
  generating,
  onSelectOption,
  onDismissOptions,
  optionCollapsed,
  onOptionCollapsedChange,
  turnChanges = null,
}) {
  return (
    <div className="we-prose-message-list">
      {chapters.map((chapter) => {
        const ctEntry = chapterTitles[chapter.chapterIndex];
        const chapterTitle = chapterTitleOf(chapterTitles, chapter.chapterIndex);
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
                  showCaret={!optionsStreaming}
                  persona={persona}
                  worldId={worldId}
                  onEdit={isStream ? undefined : onEditMessage}
                  onRegenerate={isStream ? undefined : onRegenerateMessage}
                  onEditAssistant={!isStream && msg.id === lastAssistantId ? onEditAssistantMessage : undefined}
                  onDelete={isStream ? undefined : onDeleteMessage}
                  turnChanges={turnChanges?.messageId === msg.id ? turnChanges.changes : undefined}
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
