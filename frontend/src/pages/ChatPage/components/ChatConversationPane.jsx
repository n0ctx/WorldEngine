import MessageList from '../../../components/chat/MessageList.jsx';
import SpeakerStage from '../../../components/chat/SpeakerStage.jsx';
import ChatAtmosphere from '../../../components/chat/ChatAtmosphere.jsx';
import useStageCompact from '../../../components/chat/useStageCompact.js';
import InputBox from '../../../components/chat/InputBox.jsx';
import ProviderSafetyBanner from '../../../components/ui/ProviderSafetyBanner.jsx';
import Pager from '../../../components/chat/Pager.jsx';
import { useTurnChanges } from '../../../core/hooks/useTurnChanges.js';
import useStore from '../../../core/state/index.js';
import ChatErrorBubble from './ChatErrorBubble.jsx';

export default function ChatConversationPane({
  character,
  world,
  persona,
  currentSession,
  currentSessionId,
  config,
  pageState,
  stream,
  motionPrefs,
}) {
  const { chapterTurnSize, pageTurnSize } = config;
  const { pageInfo, setPageInfo, inputBoxRef, messageListRef } = pageState;
  const stage = useStageCompact();
  const stateRound = useStore((s) => s.memoryRefreshTick);
  const turnChanges = useTurnChanges(currentSessionId, stateRound, character?.id ?? null);

  return (
    <div className="we-main we-chat-center-pane flex-1 min-w-0 flex flex-col overflow-hidden">
      <ChatAtmosphere world={world} />
      <SpeakerStage character={character} world={world} compact={stage.compact} />

      {/* 消息列表 */}
      <MessageList
        ref={messageListRef}
        key={stream.messageListKey}
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
        onScroll={stage.onScroll}
        turnChanges={turnChanges}
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
        onContinue={stream.handleContinue}
        onImpersonate={stream.handleImpersonate}
        onRetry={stream.handleRetryLast}
        onTitle={stream.handleRetitle}
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
