import { useEffect, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useParams } from 'react-router-dom';
import useStore from '../../core/state/index.js';
import Icon from '../../components/ui/Icon.jsx';
import LongTermMemoryModal from '../../components/session/LongTermMemoryModal.jsx';
import { getCharacter } from '../../core/api/characters.js';
import { getPersona } from '../../core/api/personas.js';
import { getSession } from '../../core/api/sessions.js';
import SessionListPanel from './components/SessionListPanel.jsx';
import MessageList from '../../components/chat/MessageList.jsx';
import InputBox from '../../components/chat/InputBox.jsx';
import Pager from '../../components/chat/Pager.jsx';
import PageLayout from '../layout/PageLayout.jsx';
import StatePanel from '../../components/state/StatePanel.jsx';
import { syncDiaryTimeField } from '../../core/api/world-state-fields.js';
import { loadRules } from '../../core/utils/regex-runner.js';
import { getAvatarColor, getAvatarUrl } from '../../core/utils/avatar.js';
import { log } from '../../core/utils/logger.js';
import { usePageConfig } from './hooks/usePageConfig.js';
import { useMemoryIndicators } from './hooks/useMemoryIndicators.js';
import { useChatStream } from './hooks/useChatStream.js';

export default function ChatPage() {
  const { characterId } = useParams();

  const { ltmEnabled, chapterTurnSize, pageTurnSize } = usePageConfig();
  const { currentSessionId, setCurrentSessionId, currentCharacterId, setCurrentCharacterId } = useStore();

  const [character, setCharacter] = useState(null);
  const [persona, setPersona] = useState(null);
  const [ltmOpen, setLtmOpen] = useState(false);
  const [pageInfo, setPageInfo] = useState({ totalPages: 1, currentPage: 0 });
  const inputBoxRef = useRef(null);
  const messageListRef = useRef(null);

  const memory = useMemoryIndicators();
  const { memoryRecalling, memoryExpanding, memoryWriting, recallSummary } = memory;

  const stream = useChatStream({
    character,
    messageListRef,
    inputBoxRef,
    currentSessionId,
    setCurrentSessionId,
    memory,
  });
  const {
    currentSession,
    setCurrentSession,
    clearActiveSession,
    generating,
    streamingText,
    streamingKey,
    continuingMessageId,
    continuingText,
    errorBubble,
    currentOptions,
    setCurrentOptions,
    optionCollapsed,
    setOptionCollapsed,
    messageListKey,
    setPendingDiaryInject,
    impersonating,
    handleSessionSelect,
    handleSessionCreate,
    handleSessionDelete,
    handleSend,
    handleStop,
    handleEditMessage,
    handleRegenerateMessage,
    handleEditAssistantMessage,
    handleDeleteMessage,
    handleContinue,
    handleImpersonate,
    handleRetryLast,
    handleRetryAfterError,
    handleRetitle,
    selectOption,
    handleMessagesLoaded,
  } = stream;

  // 加载角色信息
  useEffect(() => {
    if (!characterId) return;
    let cancelled = false;
    const shouldResetSession = !!currentCharacterId && currentCharacterId !== characterId;

    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      if (shouldResetSession) {
        clearActiveSession();
      }
      setCurrentCharacterId(characterId);
      setCharacter(null);
      setPersona(null);
      setCurrentSession((prev) => (shouldResetSession ? null : prev));

      getCharacter(characterId).then((c) => {
        if (cancelled) return;
        setCharacter(c);
        if (c.world_id) {
          getPersona(c.world_id).then((p) => {
            if (!cancelled) setPersona(p);
          }).catch((err) => {
            log.error('chat.persona.load_failed', err, { toast: '加载玩家信息失败' });
          });
          syncDiaryTimeField(c.world_id).catch((err) => {
            log.warn('chat.diary.sync_failed', err);
          });
        }
      }).catch((err) => {
        log.error('chat.character.load_failed', err, { toast: '加载角色信息失败' });
      });

      if (!shouldResetSession && currentSessionId) {
        getSession(currentSessionId)
          .then((session) => {
            if (cancelled) return;
            if (session?.character_id === characterId) {
              setCurrentSession(session);
              return;
            }
            clearActiveSession();
          })
          .catch(() => {
            if (!cancelled) clearActiveSession();
          });
      } else if (!currentSessionId) {
        setCurrentSession(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [characterId, clearActiveSession, currentCharacterId, currentSessionId, setCurrentCharacterId, setCurrentSession]);

  // 启动时加载正则规则缓存
  useEffect(() => {
    loadRules('chat').catch(() => {});
  }, []);

  return (
    <PageLayout
      left={(
        <SessionListPanel
          character={character}
          currentSessionId={currentSessionId}
          onSessionSelect={handleSessionSelect}
          onSessionCreate={handleSessionCreate}
          onSessionDelete={handleSessionDelete}
        />
      )}
      recall={{ memoryRecalling, memoryExpanding, memoryWriting, recallSummary }}
      main={(
        <div className="we-main we-chat-center-pane flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* 顶部栏 */}
        <div className="we-chat-center-header">
          {currentSession ? (
            <>
              <h1 className="we-chat-center-title">
                {currentSession.title || '新对话'}
              </h1>
              {ltmEnabled && (
                <button
                  type="button"
                  className="we-chat-center-action"
                  onClick={() => setLtmOpen(true)}
                  aria-label="长期记忆"
                  title="长期记忆"
                >
                  <Icon size={20} aria-label="长期记忆">
                    <path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z" />
                    <path d="M8 8h8" />
                    <path d="M8 12h8" />
                    <path d="M8 16h5" />
                  </Icon>
                </button>
              )}
            </>
          ) : (
            <span className="flex-1" />
          )}
        </div>
        <AnimatePresence>
          {ltmEnabled && ltmOpen && currentSession && (
            <LongTermMemoryModal
              key="ltm-modal"
              sessionId={currentSession.id}
              onClose={() => setLtmOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* 消息列表 */}
        <MessageList
          ref={messageListRef}
          key={`${currentSessionId}-${messageListKey}`}
          sessionId={currentSessionId}
          sessionTitle={currentSession?.title || ''}
          character={character}
          persona={persona}
          worldId={character?.world_id ?? null}
          generating={generating}
          streamingText={streamingText}
          streamingKey={streamingKey}
          onEditMessage={handleEditMessage}
          onRegenerateMessage={handleRegenerateMessage}
          onEditAssistantMessage={handleEditAssistantMessage}
          onDeleteMessage={handleDeleteMessage}
          continuingMessageId={continuingMessageId}
          continuingText={continuingText}
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

        {/* 错误气泡：生成失败时保留可见，提供重试入口 */}
        <AnimatePresence>
        {errorBubble && !generating && (
          <motion.div
            key="error-bubble"
            initial={{ opacity: 0, y: 8, filter: 'blur(1.5px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -4, filter: 'blur(1px)', transition: { duration: 0.15 } }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="px-4 pb-2 shrink-0"
          >
            <div className="max-w-[800px] mx-auto">
              <div className="flex items-start gap-3">
                <div
                  className="we-chat-error-avatar"
                  style={{ '--avatar-bg': getAvatarColor(character?.id) }}
                >
                  {getAvatarUrl(character?.avatar_path)
                    ? <img src={getAvatarUrl(character?.avatar_path)} alt="" className="w-6 h-6 object-cover" />
                    : (character?.name?.[0] || '?')}
                </div>
                <div className="flex flex-col gap-1 max-w-[75%]">
                  <span className="text-xs opacity-50">{character?.name}</span>
                  {errorBubble.partialContent && (
                    <div className="px-4 py-3 rounded-[var(--we-radius-lg)] rounded-tl-sm bg-[var(--we-color-bg-surface)] border border-[var(--we-color-border-default)] text-[var(--we-color-text-primary)] text-sm leading-relaxed whitespace-pre-wrap opacity-60">
                      {errorBubble.partialContent}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-1 rounded-full bg-[var(--we-color-accent-bg)] text-[var(--we-color-text-danger)] border border-[var(--we-color-border-focus)]">
                      生成失败：{errorBubble.errorMsg}
                    </span>
                    <button
                      onClick={handleRetryAfterError}
                      className="text-xs px-3 py-1 rounded-[var(--we-radius-lg)] border border-[var(--we-color-border-default)] hover:bg-[var(--we-color-bg-subtle)] transition-colors flex items-center gap-1 text-[var(--we-color-text-secondary)]"
                    >
                      <Icon size={16}>
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 .49-4.98" />
                      </Icon>
                      重新生成
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* 输入框 */}
        <InputBox
          ref={inputBoxRef}
          onSend={handleSend}
          onStop={handleStop}
          generating={generating}
          impersonating={impersonating}
          onScrollToBottom={() => messageListRef.current?.scrollPageToBottom?.()}
          onContinue={handleContinue}
          onImpersonate={handleImpersonate}
          onRetry={handleRetryLast}
          onTitle={handleRetitle}
          worldId={character?.world_id ?? null}
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
      )}
      right={(
        <StatePanel
          sessionId={currentSessionId}
          character={character}
          persona={persona}
          worldId={character?.world_id ?? null}
          onDiaryInject={setPendingDiaryInject}
        />
      )}
    />
  );
}
