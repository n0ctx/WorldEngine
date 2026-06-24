import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { syncDiaryTimeField } from '../../core/api/world-state-fields.js';
import { useAppModeStore } from '../../core/state/appMode.js';
import { SETTINGS_MODE } from '../../core/constants/settings';
import { refreshCustomCss } from '../../core/api/custom-css-snippets.js';
import { getPersona, getPersonaById } from '../../core/api/personas.js';
import useStore from '../../core/state/index.js';
import { listWritingSessions, createWritingSession } from '../../core/api/writing-sessions.js';
import { getSession } from '../../core/api/sessions.js';
import PageLayout from '../layout/PageLayout.jsx';
import NearbyPanel from './components/NearbyPanel.jsx';
import MessageList from '../../components/chat/MessageList.jsx';
import InputBox from '../../components/chat/InputBox.jsx';
import Pager from '../../components/chat/Pager.jsx';
import ProviderSafetyBanner from '../../components/ui/ProviderSafetyBanner.jsx';
import WritingSessionList from './components/WritingSessionList.jsx';
import LongTermMemoryModal from '../../components/session/LongTermMemoryModal.jsx';
import TableMemoryModal from '../../components/session/TableMemoryModal.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { AnimatePresence } from 'framer-motion';
import { log } from '../../core/utils/logger.js';
import { writingSessionListBridge } from '../../core/utils/session-list-bridge.js';
import { usePageConfig } from './hooks/usePageConfig.js';
import { useMemoryIndicators } from './hooks/useMemoryIndicators.js';
import { useWritingStream } from './hooks/useWritingStream.js';

export default function WritingSpacePage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const setAppMode = useAppModeStore((s) => s.setAppMode);
  const currentWritingSessionId = useStore((s) => s.currentWritingSessionId);
  const setCurrentWritingSessionId = useStore((s) => s.setCurrentWritingSessionId);

  const { ltmEnabled, tableMemoryEnabled, chapterTurnSize, pageTurnSize } = usePageConfig();

  useEffect(() => {
    setAppMode(SETTINGS_MODE.WRITING);
    refreshCustomCss(SETTINGS_MODE.WRITING);
    return () => {
      setAppMode(SETTINGS_MODE.CHAT);
      refreshCustomCss(SETTINGS_MODE.CHAT);
    };
  }, [setAppMode]);

  const [persona, setPersona] = useState(null);
  const [ltmOpen, setLtmOpen] = useState(false);
  const [tmOpen, setTmOpen] = useState(false);
  const [pageInfo, setPageInfo] = useState({ totalPages: 1, currentPage: 0 });
  const [isInitializing, setIsInitializing] = useState(false);
  const [initError, setInitError] = useState(null);
  const [initRetryToken, setInitRetryToken] = useState(0);

  const inputBoxRef = useRef(null);
  const messageListRef = useRef(null);
  // 折叠态用 ref（非响应式 UI 提示）：渲染期在页面本地 ref 读取，避免 react-hooks/refs 误报。
  const optionCollapsedRef = useRef(false);

  const memory = useMemoryIndicators();
  const { memoryRecalling, memoryExpanding, memoryWriting, recallSummary } = memory;

  const stream = useWritingStream({ worldId, messageListRef, inputBoxRef, optionCollapsedRef, memory });
  const {
    currentSession,
    generating,
    streamingText,
    streamingKey,
    continuingMessageId,
    continuingText,
    error,
    currentOptions,
    setCurrentOptions,
    chapterTitles,
    messageListKey,
    setPendingDiaryInject,
    impersonating,
    stateTick,
    diaryTick,
    stateQueuedTick,
    stateFailedTick,
    savedRecallTick,
    savedRecallHits,
    clearOptionsState,
    enterSession,
    handleSessionCreate,
    handleSessionDelete,
    handleStop,
    handleSend,
    handleEditMessage,
    handleRegenerateMessage,
    handleRetryAfterError,
    handleEditAssistantMessage,
    handleDeleteMessage,
    handleContinue,
    handleImpersonate,
    handleRetitle,
    handleChapterEdit,
    handleChapterRetitle,
    selectOption,
    handleMessagesLoaded,
  } = stream;

  useEffect(() => {
    if (!worldId) return;
    const timeoutId = setTimeout(() => {
      clearOptionsState();
      // writing session 自带 persona_id；session 加载完成后再由专门 effect 同步 persona 头像
      // 此处先按世界 active persona 兜底渲染，避免顶栏闪空
      getPersona(worldId).then(setPersona).catch(() => {});
      syncDiaryTimeField(worldId).catch(() => {});
    }, 0);
    return () => clearTimeout(timeoutId);
    // clearOptionsState 为流 hook 内的命令式重置入口，跟随 worldId 触发即可，不需要进 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);

  // session 切换时，按 session.persona_id 重新加载 persona 头像/名字
  useEffect(() => {
    const personaId = currentSession?.persona_id;
    if (!personaId) return;
    getPersonaById(personaId).then(setPersona).catch(() => {});
  }, [currentSession?.persona_id]);

  // 初始化：加载或自动创建第一个会话
  // 若 currentWritingSessionId 给了目标 session（来自 TopBar「会话」入口），优先选它；
  // 命中失败/无 hint 时落到 sessions[0]（列表已按 updated_at DESC 排序，即最新一条）。
  useEffect(() => {
    if (!worldId) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setIsInitializing(true);
      setInitError(null);
    });
    listWritingSessions(worldId).then((sessions) => {
      if (cancelled) return;
      const hintId = useStore.getState().currentWritingSessionId;
      if (sessions.length === 0) {
        createWritingSession(worldId).then((s) => {
          if (cancelled) return;
          writingSessionListBridge.addSession?.(s);
          enterSession(s);
          setIsInitializing(false);
        }).catch((err) => {
          if (cancelled) return;
          log.error('writing.session.create_failed', err, { toast: err.message || '创建写作会话失败' });
          setInitError('创建写作会话失败，请重试');
          setIsInitializing(false);
        });
        return;
      }
      const target = (hintId && sessions.find((s) => s.id === hintId)) || sessions[0];
      enterSession(target);
      setIsInitializing(false);
    }).catch((err) => {
      if (cancelled) return;
      log.error('writing.session.list_failed', err, { toast: err.message || '加载写作会话失败' });
      setInitError('加载写作会话失败，请重试');
      setIsInitializing(false);
    });
    return () => {
      cancelled = true;
    };
    // enterSession is intentionally kept as the page-level imperative transition used by stream callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId, initRetryToken]);

  // 已在写作页时 TopBar 再次下发「会话」hint：切到目标 session 后清空 hint。
  // 与 init 效应配合：若 hint 在 mount 时已被 init 消费命中，进入此效应后 ids 相同直接清 hint；
  // 不一致（用户在另一会话编辑期间，目标 session 的 updated_at 已变成更新一条）则按 id 拉取并切换。
  useEffect(() => {
    if (!currentWritingSessionId) return;
    if (!currentSession) return;
    if (currentSession.id === currentWritingSessionId) {
      setCurrentWritingSessionId(null);
      return;
    }
    let cancelled = false;
    getSession(currentWritingSessionId).then((s) => {
      if (cancelled) return;
      if (s && s.mode === 'writing') enterSession(s);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setCurrentWritingSessionId(null);
    });
    return () => { cancelled = true; };
    // enterSession 是 page 内命令式入口，跟 store setter 一样不需要进 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWritingSessionId, currentSession]);

  // 折叠态为非响应式 ref：渲染期读取其当前值作为 MessageList 初始折叠态（行为同原组件）。
  // eslint-disable-next-line react-hooks/refs
  const optionCollapsed = optionCollapsedRef.current;

  return (
    <PageLayout
      left={(
        <WritingSessionList
          worldId={worldId}
          currentSessionId={currentSession?.id}
          onSessionSelect={enterSession}
          onSessionCreate={handleSessionCreate}
          onSessionDelete={handleSessionDelete}
          onBack={() => navigate(`/worlds/${worldId}`)}
        />
      )}
      recall={{ memoryRecalling, memoryExpanding, memoryWriting, recallSummary }}
      main={(
        <div className="we-chat-center-pane flex-1 min-w-0 flex flex-col overflow-hidden relative">
            {/* 章节标题区 */}
            <div className="we-chat-center-header">
              {currentSession ? (
                <>
                  <h1 className="we-chat-center-title">
                    {currentSession.title || '写作进行中'}
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
                  {tableMemoryEnabled && (
                    <button
                      type="button"
                      className="we-chat-center-action"
                      onClick={() => setTmOpen(true)}
                      aria-label="表格记忆"
                      title="表格记忆"
                    >
                      <Icon size={20} aria-label="表格记忆">
                        <rect x="3" y="4" width="18" height="16" rx="1.5" />
                        <path d="M3 9h18" />
                        <path d="M3 14h18" />
                        <path d="M9 4v16" />
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
              {tableMemoryEnabled && tmOpen && currentSession && (
                <TableMemoryModal
                  key="tm-modal"
                  sessionId={currentSession.id}
                  onClose={() => setTmOpen(false)}
                />
              )}
            </AnimatePresence>

            {isInitializing ? (
              <div className="flex-1 flex items-center justify-center text-sm text-[var(--we-color-text-secondary)] opacity-60">
                正在准备写作空间…
              </div>
            ) : initError ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-sm text-[var(--we-color-text-danger)]">{initError}</p>
                <button
                  type="button"
                  className="we-panel-card-action we-panel-card-action--chip"
                  onClick={() => setInitRetryToken((token) => token + 1)}
                >
                  重试
                </button>
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
                onOptionCollapsedChange={(c) => { optionCollapsedRef.current = c; }}
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
                    <Icon size={16}>
                      <polyline points="1 4 1 10 7 10" />
                      <path d="M3.51 15a9 9 0 1 0 .49-4.98" />
                    </Icon>
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
        <NearbyPanel
          worldId={worldId}
          sessionId={currentSession?.id}
          stateTick={stateTick}
          diaryTick={diaryTick}
          stateQueuedTick={stateQueuedTick}
          stateFailedTick={stateFailedTick}
          savedRecallTick={savedRecallTick}
          savedRecallHits={savedRecallHits}
          persona={persona}
          onDiaryInject={setPendingDiaryInject}
        />
      )}
    />
  );
}
