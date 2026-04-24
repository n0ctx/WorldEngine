import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Icon from '../ui/Icon.jsx';
import useStore from '../../store/index.js';
import {
  resetSessionWorldStateValues,
  resetSessionPersonaStateValues,
  resetSessionCharacterStateValues,
} from '../../api/session-state-values.js';
import { fetchDiaryContent } from '../../api/daily-entries.js';
import { getWorld } from '../../api/worlds.js';
import { useSessionState } from '../../hooks/useSessionState.js';
import CharacterSeal from './CharacterSeal.jsx';
import StatusSection from './StatusSection.jsx';

const MotionDiv = motion.div;

// ── 金箔装饰分隔线 ──────────────────────────────────────────
function GoldDivider() {
  return (
    <div className="we-panel-divider" aria-hidden="true">
      <span className="we-panel-divider-line" />
      <span className="we-panel-divider-gem">✦</span>
      <span className="we-panel-divider-line" />
    </div>
  );
}

// ── 折叠箭头 ────────────────────────────────────────────────
function Chevron({ open }) {
  return (
    <Icon
      size={16}
      viewBox="0 0 10 10"
      strokeWidth="2.5"
      className={`we-state-chevron${open ? ' we-state-chevron--open' : ''}`}
    >
      <polyline points="2,3.5 5,6.5 8,3.5" />
    </Icon>
  );
}

const RECENT_LIMIT = 5;

// ── 日记条目 ────────────────────────────────────────────────
function DiaryEntry({ entry, index, selected, onSelect }) {
  return (
    <div
      className={`we-timeline-entry we-diary-entry${selected ? ' we-diary-entry--selected' : ''}`}
      style={{
        animationDelay: `${index * 50}ms`,
      }}
      onClick={() => onSelect(entry)}
      title="点击注入下轮提示词"
    >
      <span className="we-timeline-dot">·</span>
      <span className="we-timeline-text">
        <em className="we-timeline-round">{entry.date_display}</em>
        {' '}{entry.summary}
      </span>
    </div>
  );
}

export default function StatePanel({ sessionId, character, worldId, persona, onDiaryInject }) {
  const tick = useStore((s) => s.memoryRefreshTick);
  const { stateData, setStateData, diaryEntries, stateJustChanged, isUpdating } = useSessionState(sessionId, tick);

  const [worldResetting, setWorldResetting] = useState(false);
  const [personaResetting, setPersonaResetting] = useState(false);
  const [charResetting, setCharResetting] = useState(false);
  const [worldName, setWorldName] = useState(null);

  // 折叠状态
  const [diaryOpen, setDiaryOpen] = useState(true);
  const [diaryExpanded, setDiaryExpanded] = useState(false);

  // 已选中（待注入）的日记条目
  const [selectedEntry, setSelectedEntry] = useState(null);

  useEffect(() => {
    if (!worldId) { setWorldName(null); return; }
    getWorld(worldId).then((w) => setWorldName(w?.name ?? null)).catch(() => {});
  }, [worldId]);

  // ── 重置处理 ──────────────────────────────────────────────
  async function handleResetWorld() {
    if (!sessionId || worldResetting) return;
    setWorldResetting(true);
    try {
      const newState = await resetSessionWorldStateValues(sessionId);
      setStateData(newState);
    } catch (e) { console.error('重置世界状态失败', e); }
    finally { setWorldResetting(false); }
  }

  async function handleResetPersona() {
    if (!sessionId || personaResetting) return;
    setPersonaResetting(true);
    try {
      const newState = await resetSessionPersonaStateValues(sessionId);
      setStateData(newState);
    } catch (e) { console.error('重置玩家状态失败', e); }
    finally { setPersonaResetting(false); }
  }

  async function handleResetChar() {
    if (!sessionId || charResetting) return;
    setCharResetting(true);
    try {
      const newState = await resetSessionCharacterStateValues(sessionId);
      setStateData(newState);
    } catch (e) { console.error('重置角色状态失败', e); }
    finally { setCharResetting(false); }
  }

  // ── 日记点击注入 ─────────────────────────────────────────
  async function handleDiarySelect(entry) {
    if (selectedEntry?.date_str === entry.date_str) {
      // 再次点击取消
      setSelectedEntry(null);
      onDiaryInject?.(null);
      return;
    }
    setSelectedEntry(entry);
    try {
      const content = await fetchDiaryContent(sessionId, entry.date_str);
      onDiaryInject?.(content);
    } catch (e) {
      console.error('获取日记内容失败', e);
    }
  }

  // 当 sessionId 变化时清空已选
  useEffect(() => { setSelectedEntry(null); }, [sessionId]);

  const hasDiary = Array.isArray(diaryEntries) && diaryEntries.length > 0;
  // 从近到远排列
  const reversedDiary = hasDiary ? [...diaryEntries].reverse() : [];
  const recentDiary = reversedDiary.slice(0, RECENT_LIMIT);
  const olderDiary = reversedDiary.slice(RECENT_LIMIT);
  const hasMore = olderDiary.length > 0;

  return (
    <div className="we-state-panel">
      {/* 书脊阴影 */}
      <div className="we-state-spine" />

      {/* 滚动内容层 */}
      <div className="we-state-scroll">

        {/* ── 头部 ── */}
        <div className="we-state-panel-header">
          <div className="we-seal-wrap">
            <CharacterSeal character={character} size={80} />
          </div>
          {character ? (
            <>
              <p className="we-panel-char-name">{character.name}</p>
              {worldName && <p className="we-panel-world-name">{worldName}</p>}
            </>
          ) : (
            <p className="we-panel-placeholder">尚未选择角色</p>
          )}
        </div>

        <GoldDivider />

        {/* ── 内容区 ── */}
        <div className="we-panel-body">

          <StatusSection
            title="WORLD"
            className="we-status-world"
            rows={stateData?.world ?? null}
            onReset={handleResetWorld}
            resetting={worldResetting}
            collapsible
          />

          <StatusSection
            title="PLAYER"
            className="we-status-player"
            rows={stateData?.persona ?? null}
            pinnedName={persona?.name}
            onReset={handleResetPersona}
            resetting={personaResetting}
            collapsible
          />

          <StatusSection
            title="CHARACTER"
            className="we-status-character"
            rows={stateData?.character ?? null}
            pinnedName={character?.name}
            onReset={handleResetChar}
            resetting={charResetting}
            collapsible
          />

          {/* ── 日记时间线（可折叠） ── */}
          <div className="we-timeline">
            <div
              className="we-state-section-title we-state-section-title--toggle"
              onClick={() => setDiaryOpen((o) => !o)}
            >
              <Chevron open={diaryOpen} />
              <span className="we-section-label">TIMELINE</span>
              <span className="we-section-rule" />
            </div>
            {selectedEntry && (
              <div className="we-diary-selected-note">
                已选：{selectedEntry.date_display}（下轮生效，再次点击取消）
              </div>
            )}
            <div className={`we-state-collapse${diaryOpen ? ' we-state-collapse--open' : ''}`}>
              <div className="we-state-collapse-inner">
                {diaryEntries === null ? (
                  <div className="we-state-skeleton-list">
                    {[85, 65, 90].map((w, i) => (
                      <div key={i} className="we-skel we-state-skeleton-line" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                ) : !hasDiary ? (
                  <p className="we-section-empty">暂无日记</p>
                ) : (
                  <div className="we-timeline-list">
                    {recentDiary.map((entry, i) => (
                      <DiaryEntry
                        key={entry.date_str}
                        entry={entry}
                        index={i}
                        selected={selectedEntry?.date_str === entry.date_str}
                        onSelect={handleDiarySelect}
                      />
                    ))}
                    {hasMore && (
                      <>
                        {diaryExpanded && olderDiary.map((entry, i) => (
                          <DiaryEntry
                            key={entry.date_str}
                            entry={entry}
                            index={RECENT_LIMIT + i}
                            selected={selectedEntry?.date_str === entry.date_str}
                            onSelect={handleDiarySelect}
                          />
                        ))}
                        <div
                          className="we-diary-more"
                          onClick={() => setDiaryExpanded((v) => !v)}
                        >
                          {diaryExpanded ? '▲ 收起' : `▼ 展开更多（${olderDiary.length} 条）`}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── 悬浮状态卡 ── */}
      <AnimatePresence>
        {isUpdating && (
          <MotionDiv
            key="state-overlay-updating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="we-state-change-overlay"
          >
            <MotionDiv
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="we-state-change-chip"
            >
              <span className="we-state-change-text">
                整理中
              </span>
            </MotionDiv>
          </MotionDiv>
        )}
        {!isUpdating && stateJustChanged && (
          <MotionDiv
            key="state-overlay-done"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="we-state-change-overlay"
          >
            <MotionDiv
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="we-state-change-chip"
            >
              <span className="we-state-change-text">
                已整理
              </span>
            </MotionDiv>
          </MotionDiv>
        )}
      </AnimatePresence>
    </div>
  );
}
