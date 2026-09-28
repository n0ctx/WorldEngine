import { AnimatePresence } from 'framer-motion';
import Icon from '../../../components/ui/Icon.jsx';
import MiddleSummaryModal from '../../../components/session/MiddleSummaryModal.jsx';
import StateMemoryModal from '../../../components/session/StateMemoryModal.jsx';
import MessageList from '../../../components/chat/MessageList.jsx';
import SpeakerStage from '../../../components/chat/SpeakerStage.jsx';
import InputBox from '../../../components/chat/InputBox.jsx';
import ProviderSafetyBanner from '../../../components/ui/ProviderSafetyBanner.jsx';
import Pager from '../../../components/chat/Pager.jsx';
import ChatErrorBubble from './ChatErrorBubble.jsx';

export default function ChatConversationPane({
  character,
  persona,
  currentSession,
  currentSessionId,
  config,
  pageState,
  stream,
  motionPrefs,
  onBack,
}) {
  const { chapterTurnSize, pageTurnSize } = config;
  const {
    summaryOpen, setSummaryOpen, stateMemoryOpen, setStateMemoryOpen, pageInfo, setPageInfo,
    inputBoxRef, messageListRef,
  } = pageState;

  return (
    <div className="we-main we-chat-center-pane flex-1 min-w-0 flex flex-col overflow-hidden">
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
          onClick={onBack}
          className="we-chat-pane-back"
        >
          <Icon size={14}>
            <polyline points="15 18 9 12 15 6" />
          </Icon>
          返回世界
        </button>
      </div>

      <SpeakerStage character={character} />

      {/* 消息列表 */}
      <MessageList
        ref={messageListRef}
        key={`${currentSessionId}-${stream.messageListKey}`}
        sessionId={currentSessionId}
        sessionTitle={currentSession?.title || ''}
        character={character}
        persona={persona}
        worldId={character?.world_id ?? null}
        generating={stream.generating}
        streamingText={stream.streamingText}
        streamingKey={stream.streamingKey}
        onEditMessage={stream.handleEditMessage}
        onRegenerateMessage={stream.handleRegenerateMessage}
        onEditAssistantMessage={stream.handleEditAssistantMessage}
        onDeleteMessage={stream.handleDeleteMessage}
        continuingMessageId={stream.continuingMessageId}
        continuingText={stream.continuingText}
        options={stream.currentOptions}
        onSelectOption={stream.selectOption}
        onDismissOptions={() => stream.setCurrentOptions([])}
        optionCollapsed={stream.optionCollapsed}
        onOptionCollapsedChange={stream.setOptionCollapsed}
        onMessagesLoaded={stream.handleMessagesLoaded}
        chapterTurnSize={chapterTurnSize}
        pageTurnSize={pageTurnSize}
        onPageInfoChange={setPageInfo}
      />

      {/* 错误气泡：生成失败时保留可见，提供重试入口 */}
      <ChatErrorBubble
        character={character}
        errorBubble={stream.errorBubble}
        generating={stream.generating}
        onRetry={stream.handleRetryAfterError}
        motionPrefs={motionPrefs}
      />

      {/* Provider 安全信号横幅（紧邻输入框上方，role=alert 自动朗读） */}
      <ProviderSafetyBanner />

      {/* 输入框 */}
      <InputBox
        ref={inputBoxRef}
        onSend={stream.handleSend}
        onStop={stream.handleStop}
        generating={stream.generating}
        impersonating={stream.impersonating}
        onScrollToBottom={() => messageListRef.current?.scrollPageToBottom?.()}
        onContinue={stream.handleContinue}
        onImpersonate={stream.handleImpersonate}
        onRetry={stream.handleRetryLast}
        onTitle={stream.handleRetitle}
        onMiddleSummary={currentSession ? () => setSummaryOpen(true) : null}
        onStateMemory={currentSession ? () => setStateMemoryOpen(true) : null}
        worldId={character?.world_id ?? null}
        sessionId={currentSessionId}
        mode="chat"
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
