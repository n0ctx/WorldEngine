import { useEffect, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import useStore from '../../core/state/index.js';
import useCurrentStoryStore from '../../core/state/currentStory.js';
import Icon from '../../components/ui/Icon.jsx';
import LongTermMemoryModal from '../../components/session/LongTermMemoryModal.jsx';
import TableMemoryModal from '../../components/session/TableMemoryModal.jsx';
import { getCharacter } from '../../core/api/characters.js';
import { getPersona } from '../../core/api/personas.js';
import { getSession, createSession } from '../../core/api/sessions.js';
import { chatSessionListBridge } from '../../core/utils/session-list-bridge.js';
import WorldTimelinePanel from '../../components/session/WorldTimelinePanel.jsx';
import MessageList from '../../components/chat/MessageList.jsx';
import SpeakerStage from '../../components/chat/SpeakerStage.jsx';
import InputBox from '../../components/chat/InputBox.jsx';
import { useDanmakuBandStore } from '../../core/state/danmakuBand.js';
import ProviderSafetyBanner from '../../components/ui/ProviderSafetyBanner.jsx';
import Pager from '../../components/chat/Pager.jsx';
import PageLayout from '../layout/PageLayout.jsx';
import StatePanel from '../../components/state/StatePanel.jsx';
import { syncDiaryTimeField } from '../../core/api/world-state-fields.js';
import { loadRules } from '../../core/utils/regex-runner.js';
import { getAvatarColor, getAvatarUrl } from '../../core/utils/avatar.js';
import { log } from '../../core/utils/logger.js';
import { usePageConfig } from '../../core/hooks/usePageConfig.js';
import { useMemoryIndicators } from '../../core/hooks/useMemoryIndicators.js';
import { useChatStream } from './hooks/useChatStream.js';
import { useMotion } from '../../core/hooks/useMotion.js';

export default function ChatPage() {
  const motionPrefs = useMotion();
  const { characterId } = useParams();
  const navigate = useNavigate();

  const { ltmEnabled, tableMemoryEnabled, chapterTurnSize, pageTurnSize } = usePageConfig();
  const { currentSessionId, setCurrentSessionId, currentCharacterId, setCurrentCharacterId } = useStore();

  const [character, setCharacter] = useState(null);
  const [persona, setPersona] = useState(null);
  const [ltmOpen, setLtmOpen] = useState(false);
  const [tmOpen, setTmOpen] = useState(false);
  const [pageInfo, setPageInfo] = useState({ totalPages: 1, currentPage: 0 });
  const inputBoxRef = useRef(null);
  const messageListRef = useRef(null);

  const memory = useMemoryIndicators();
  const { memoryRecalling, memoryExpanding, memoryWriting, recallSummary } = memory;
  // 弹幕带在全局 store（顶部栏 TopBar 渲染），由流 hook 写入；离开页面时清空
  const clearDanmakuBand = useDanmakuBandStore((s) => s.clear);
  useEffect(() => () => clearDanmakuBand(), [clearDanmakuBand]);

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
    handleSessionCreate,
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

  // 当前故事线标题同步给 TopBar 面包屑；离开页面清空，避免残留
  const setStoryTitle = useCurrentStoryStore((s) => s.setStoryTitle);
  useEffect(() => {
    setStoryTitle(currentSession?.title || (character ? `与${character.name}的对话` : null));
  }, [currentSession?.title, character, setStoryTitle]);
  useEffect(() => () => setStoryTitle(null), [setStoryTitle]);

  // 新建对话会话：绑定当前角色，创建后通过 bridge 合并进左侧时间线，再进入该会话
  async function handleCreateChatSession() {
    if (!character) return;
    try {
      const session = await createSession(character.id);
      chatSessionListBridge.addSession?.(session);
      handleSessionCreate(session);
    } catch (e) {
      log.error('session.create_failed', e, { toast: e.message || '创建会话失败' });
    }
  }

  return (
    <PageLayout
      leftLabel="会话列表"
      rightLabel="状态面板"
      left={(
        <WorldTimelinePanel
          worldId={character?.world_id ?? null}
          currentMode="chat"
          currentSessionId={currentSessionId}
          onActiveSessionDeleted={clearActiveSession}
          onActiveSessionRenamed={(title) => setCurrentSession((prev) => (prev ? { ...prev, title } : prev))}
          headerRight={(
            <button onClick={handleCreateChatSession} className="we-session-list-create">
              <Icon size={16} strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </Icon>
              新建会话
            </button>
          )}
        />
      )}
      recall={{ memoryRecalling, memoryExpanding, memoryWriting, recallSummary }}
      main={(
        <div className="we-main we-chat-center-pane flex-1 min-w-0 flex flex-col overflow-hidden">
        <AnimatePresence>
          {ltmEnabled && ltmOpen && currentSession && (
            <LongTermMemoryModal
              key="ltm-modal"
              sessionId={currentSession.id}
              onClose={() => setLtmOpen(false)}
            />
          )}
          {tableMemoryEnabled && tmOpen && currentSession && (
            <TableMemoryModal
              key="tm-modal"
              sessionId={currentSession.id}
              onClose={() => setTmOpen(false)}
            />
          )}
        </AnimatePresence>

        <div className="we-chat-pane-nav">
          <button
            onClick={() => navigate(`/worlds/${character?.world_id}`)}
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
            variants={motionPrefs.variant('messageEnter')}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, transition: motionPrefs.transition('retract') }}
            transition={motionPrefs.spring('message')}
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

        {/* Provider 安全信号横幅（紧邻输入框上方，role=alert 自动朗读） */}
        <ProviderSafetyBanner />

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
          onLongTermMemory={ltmEnabled && currentSession ? () => setLtmOpen(true) : null}
          onTableMemory={tableMemoryEnabled && currentSession ? () => setTmOpen(true) : null}
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
