import { AnimatePresence } from 'framer-motion';
import MessageList from '../../../components/chat/MessageList.jsx';
import InputBox from '../../../components/chat/InputBox.jsx';
import Pager from '../../../components/chat/Pager.jsx';
import ProviderSafetyBanner from '../../../components/ui/ProviderSafetyBanner.jsx';
import MiddleSummaryModal from '../../../components/session/MiddleSummaryModal.jsx';
import StateMemoryModal from '../../../components/session/StateMemoryModal.jsx';
import { ChevronLeft, RotateCcw } from 'lucide-react';
import Button from '../../../components/ui/Button.jsx';

export default function WritingSpaceConversationPane({ worldId, navigate, config, pageState, lifecycle, stream }) {
  const { chapterTurnSize, pageTurnSize } = config;
  const {
    summaryOpen, setSummaryOpen, stateMemoryOpen, setStateMemoryOpen, pageInfo, setPageInfo,
    inputBoxRef, messageListRef,
  } = pageState;
  const { persona, isInitializing, initError, retryInitialization } = lifecycle;
  const {
    currentSession, generating, streamingText, streamingKey, continuingMessageId,
    continuingText, error, currentOptions, setCurrentOptions, optionCollapsed,
    setOptionCollapsed, chapterTitles, messageListKey, impersonating, handleStop,
    handleSend, handleEditMessage, handleRegenerateMessage, handleRetryAfterError,
    handleEditAssistantMessage, handleDeleteMessage, handleContinue, handleImpersonate,
    handleRetitle, handleChapterEdit, handleChapterRetitle, selectOption, handleMessagesLoaded,
  } = stream;

  return (
    <div className="we-chat-center-pane flex-1 min-w-0 flex flex-col overflow-hidden relative">
        <AnimatePresence>
          {summaryOpen && currentSession && (
            <MiddleSummaryModal
              key="middle-summary-modal"
              sessionId={currentSession.id}
              onClose={() => setSummaryOpen(false)}
            />
          )}
          {stateMemoryOpen && currentSession && (
            <StateMemoryModal
              key="state-memory-modal"
              sessionId={currentSession.id}
              onClose={() => setStateMemoryOpen(false)}
            />
          )}
        </AnimatePresence>
        <div className="we-chat-pane-nav">
          <button
            onClick={() => navigate(`/worlds/${worldId}`)}
            className="we-chat-pane-back"
          >
            <ChevronLeft size={14} />
            返回世界
          </button>
        </div>

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
            key={`${currentSession?.id}-${messageListKey}`}
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
          />
        )}

        {/* 错误气泡:生成失败时保留可见,显示部分内容并提供重试入口 */}
        {error && !generating && (
          <div className="we-writing-error-bar">
            {error.partialContent && (
              <div className="we-writing-error-partial">{error.partialContent}</div>
            )}
            <div className="we-writing-error-row">
              <span className="we-writing-error-text we-field-error">
                生成失败：{error.errorMsg}
              </span>
              <button
                type="button"
                className="we-writing-error-retry"
                onClick={handleRetryAfterError}
              >
                <RotateCcw size={16} />
                重新生成
              </button>
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
          onScrollToBottom={() => messageListRef.current?.scrollPageToBottom?.()}
          onContinue={handleContinue}
          onImpersonate={handleImpersonate}
          onTitle={handleRetitle}
          onMiddleSummary={currentSession ? () => setSummaryOpen(true) : null}
          onStateMemory={currentSession ? () => setStateMemoryOpen(true) : null}
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
