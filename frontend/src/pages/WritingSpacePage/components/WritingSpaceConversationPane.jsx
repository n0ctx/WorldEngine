import ChatAtmosphere from '../../../components/chat/ChatAtmosphere.jsx';
import MessageList from '../../../components/chat/MessageList.jsx';
import SpeakerStage from '../../../components/chat/SpeakerStage.jsx';
import useStageCompact from '../../../components/chat/useStageCompact.js';
import InputBox from '../../../components/chat/InputBox.jsx';
import Pager from '../../../components/chat/Pager.jsx';
import ProviderSafetyBanner from '../../../components/ui/ProviderSafetyBanner.jsx';
import { IconRotateCcw } from '../../../components/ui/icons.jsx';
import Button from '../../../components/ui/Button.jsx';
import GenerationErrorText from '../../../components/chat/GenerationErrorText.jsx';
import { useTurnChanges } from '../../../core/hooks/useTurnChanges.js';

export default function WritingSpaceConversationPane({ worldId, world, config, pageState, lifecycle, stream }) {
  const { chapterTurnSize, pageTurnSize } = config;
  const { pageInfo, setPageInfo, inputBoxRef, messageListRef } = pageState;
  const { persona, isInitializing, initError, retryInitialization } = lifecycle;
  const {
    currentSession, generating, streamingText, streamingKey, continuingMessageId,
    continuingText, error, currentOptions, setCurrentOptions, optionCollapsed,
    setOptionCollapsed, chapterTitles, messageListKey, impersonating, handleStop,
    handleSend, handleEditMessage, handleRegenerateMessage, handleRetryAfterError,
    handleEditAssistantMessage, handleDeleteMessage, handleContinue, handleImpersonate,
    handleRetitle, handleChapterEdit, handleChapterRetitle, selectOption, handleMessagesLoaded, stateTick,
  } = stream;
  const stage = useStageCompact();
  const turnChanges = useTurnChanges(currentSession?.id ?? null, stateTick);

  return (
    <div className="we-chat-center-pane flex-1 min-w-0 flex flex-col overflow-hidden relative">
        <ChatAtmosphere world={world} />
        {/* 初始化失败时没有正文可等，直接露出台前 */}
        <SpeakerStage
          world={world}
          compact={stage.compact}
          pending={!stage.settled && !initError}
          instant={stage.instant}
        />
        {isInitializing ? (
          <div className="flex-1 flex items-center justify-center we-type-ui text-[var(--we-color-text-tertiary)]">
            正在准备写作空间…
          </div>
        ) : initError ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="we-type-ui text-[var(--we-color-status-danger)]">{initError}</p>
            <Button type="button" size="sm" variant="secondary" onClick={retryInitialization}>
              重试
            </Button>
          </div>
        ) : (
          <MessageList
            ref={messageListRef}
            key={messageListKey}
            sessionId={currentSession?.id}
            character={null}
            persona={persona}
            worldId={worldId}
            generating={generating}
            streamingText={streamingText}
            streamingKey={streamingKey}
            continuingMessageId={continuingMessageId}
            continuingText={continuingText}
            onEditMessage={handleEditMessage}
            onRegenerateMessage={handleRegenerateMessage}
            onEditAssistantMessage={handleEditAssistantMessage}
            onDeleteMessage={handleDeleteMessage}
            prose
            chapterTitles={chapterTitles}
            onChapterEdit={handleChapterEdit}
            onChapterRetitle={handleChapterRetitle}
            options={currentOptions}
            onSelectOption={selectOption}
            onDismissOptions={() => setCurrentOptions([])}
            optionCollapsed={optionCollapsed}
            onOptionCollapsedChange={setOptionCollapsed}
            onMessagesLoaded={handleMessagesLoaded}
            chapterTurnSize={chapterTurnSize}
            pageTurnSize={pageTurnSize}
            onPageInfoChange={setPageInfo}
            onScroll={stage.onScroll}
            onSettled={stage.onSettled}
            turnChanges={turnChanges}
          />
        )}

        {/* 错误气泡:生成失败时保留可见,显示部分内容并提供重试入口 */}
        {error && !generating && (
          <div className="we-writing-error-bar">
            {error.partialContent && (
              <div className="we-writing-error-partial">{error.partialContent}</div>
            )}
            <div className="we-writing-error-row">
              <GenerationErrorText errorMsg={error.errorMsg} className="we-writing-error-text we-field-error" />
              <Button type="button" variant="secondary" size="sm" onClick={handleRetryAfterError}>
                <IconRotateCcw size={16} />
                重新生成
              </Button>
            </div>
          </div>
        )}

        {/* Provider 安全信号横幅 */}
        <ProviderSafetyBanner />

        {/* 输入区 */}
        <InputBox
          ref={inputBoxRef}
          onSend={handleSend}
          onStop={handleStop}
          generating={generating}
          impersonating={impersonating}
          lastUserContent=""
          worldId={worldId}
          sessionId={currentSession?.id}
          mode="writing"
          onContinue={handleContinue}
          onImpersonate={handleImpersonate}
          onTitle={handleRetitle}
          pagerSlot={(
            <Pager
              totalPages={pageInfo.totalPages}
              currentPage={pageInfo.currentPage}
              onChange={(idx) => messageListRef.current?.setPage?.(idx)}
            />
          )}
        />
    </div>
  );
}
