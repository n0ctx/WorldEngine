import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';

import PanelCard from '../../../components/ui/PanelCard.jsx';
import SessionStatePanel from '../../../components/state/SessionStatePanel.jsx';
import NearbyCharacterBlock from './NearbyCharacterBlock.jsx';

import AddSavedNearbyModal from './AddSavedNearbyModal.jsx';
import MakeCardModal from './MakeCardModal.jsx';
import ConfirmModal from '../../../components/ui/ConfirmModal.jsx';
import { fetchNearby, setNearbySaved, removeNearby } from '../../../core/api/session-nearby.js';
import { RefreshIcon } from '../../../components/state/panel-parts.jsx';
import { log } from '../../../core/utils/logger.js';

const CLASS_NAMES = {
  panel: 'we-cast-panel',
  scroll: 'we-cast-scroll',
  diaryEntry: 'we-cast-diary-entry',
  diaryEntryStyle: { transition: 'background 0.18s ease' },
  diaryMore: 'we-cast-diary-more',
  overlayKey: 'nearby-state-overlay',
  overlay: 'we-cast-state-overlay',
  overlayChipStyle: { display: 'flex', alignItems: 'center', gap: 7, userSelect: 'none' },
  overlayText: 'we-cast-state-overlay-text',
};

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function NotebookIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4h13a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V4z" />
      <line x1="8" y1="4" x2="8" y2="20" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 15 12 9 18 15" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <line x1="8" y1="8" x2="16" y2="16" />
    </svg>
  );
}

const isNearbySaved = (n) => Number(n?.is_saved) === 1;

export default function NearbyPanel({
  worldId,
  sessionId,
  persona,
  stateTick = 0,
  diaryTick = 0,
  stateQueuedTick = 0,
  stateFailedTick = 0,
  savedRecallTick = 0,
  savedRecallHits = null,
  onDiaryInject,
}) {
  const [nearby, setNearby] = useState(null); // null = loading
  const [nearbyError, setNearbyError] = useState(null);
  const [nearbyReloadToken, setNearbyReloadToken] = useState(0);
  // saved 角色默认在顶部完整 state tab 展开；用户点击"收起"或后端 saved_recall 判定未命中时进入此集合，
  // 仅在底部姓名列表里露出。仅当前会话内有效；切换会话清空。
  const [collapsedSavedIds, setCollapsedSavedIds] = useState(() => new Set());
  // 记录上次应用过的 savedRecallTick，避免对同一事件重复处理；session 切换时重置为当前 tick 以忽略陈旧 hits
  const lastAppliedRecallTickRef = useRef(savedRecallTick);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [makeCardOpen, setMakeCardOpen] = useState(false);
  const [removingNearby, setRemovingNearby] = useState(null);

  const reloadNearby = useCallback(() => {
    if (!worldId || !sessionId) {
      setNearby([]);
      return;
    }
    let cancelled = false;
    fetchNearby(worldId, sessionId)
      .then((rows) => {
        if (!cancelled) { setNearby(Array.isArray(rows) ? rows : []); setNearbyError(null); }
      })
      .catch((err) => {
        if (!cancelled) { setNearby([]); setNearbyError(err?.message || '加载附近角色失败'); }
      });
    return () => { cancelled = true; };
  }, [worldId, sessionId]);

  useEffect(() => {
    let cancelled = false;
    if (!worldId || !sessionId) {
      Promise.resolve().then(() => { if (!cancelled) setNearby([]); });
      return () => { cancelled = true; };
    }
    Promise.resolve().then(() => { if (!cancelled) { setNearby(null); setNearbyError(null); } });
    fetchNearby(worldId, sessionId)
      .then((rows) => { if (!cancelled) { setNearby(Array.isArray(rows) ? rows : []); setNearbyError(null); } })
      .catch((err) => { if (!cancelled) { setNearby([]); setNearbyError(err?.message || '加载附近角色失败'); } });
    return () => { cancelled = true; };
  }, [worldId, sessionId, stateTick, nearbyReloadToken]);

  // 切换会话/世界时清空收起集合；同时把"已应用 tick"对齐到当前值，避免之前会话的 hits 在新会话触发误收起
  useEffect(() => {
    lastAppliedRecallTickRef.current = savedRecallTick;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsedSavedIds((prev) => (prev.size === 0 ? prev : new Set()));
    // savedRecallTick 故意不进依赖：仅在 world/session 切换时对齐基线，新事件由下面的 effect 负责
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId, sessionId]);

  // 单次扫描 nearby，做两件事：
  //   a) 收到新的 saved_recall_done 事件（savedRecallTick 推进）时，按 hits 重算 saved 角色的展开/收起
  //      —— hits 中的 id 展开（从 collapsed 移除），其余 saved 收起（加入 collapsed）
  //   b) 清掉那些已不再是 saved（或已不存在）的脏 id
  useEffect(() => {
    if (!Array.isArray(nearby)) return;
    const recallAdvanced = savedRecallTick !== lastAppliedRecallTickRef.current;
    const hitSet = recallAdvanced && Array.isArray(savedRecallHits) ? new Set(savedRecallHits) : null;

    setCollapsedSavedIds((prev) => {
      if (!hitSet && prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      if (hitSet) {
        for (const n of nearby) {
          if (!isNearbySaved(n)) continue;
          if (hitSet.has(n.id)) {
            if (next.has(n.id)) { next.delete(n.id); changed = true; }
          } else if (!next.has(n.id)) {
            next.add(n.id); changed = true;
          }
        }
      }
      if (prev.size > 0) {
        const curById = new Map();
        for (const n of nearby) curById.set(n.id, n);
        for (const id of prev) {
          const row = curById.get(id);
          if (!row || !isNearbySaved(row)) { next.delete(id); changed = true; }
        }
      }
      return changed ? next : prev;
    });

    if (recallAdvanced) lastAppliedRecallTickRef.current = savedRecallTick;
  }, [nearby, savedRecallTick, savedRecallHits]);

  const addNearbyGlobalAction = (
    <button
      type="button"
      className="we-state-section-reset we-panel-card-action we-panel-card-action--chip we-panel-card-action--icon"
      onClick={() => setAddModalOpen(true)}
      aria-label="从角色卡添加"
      title="从角色卡添加"
    >
      <PlusIcon />
    </button>
  );

  const nearbyToolbarBase = (
    <button
      type="button"
      className="we-state-section-reset we-panel-card-action we-panel-card-action--chip"
      onClick={() => setMakeCardOpen(true)}
      aria-label="制卡"
      title="制卡"
    >
      <NotebookIcon /><span>制卡</span>
    </button>
  );

  const handleToggleSavedFor = async (n) => {
    const willSave = !n.is_saved;
    try {
      await setNearbySaved(worldId, sessionId, n.id, willSave);
      // 取消保存时清掉收起标记，避免后续再保存时残留旧状态
      if (!willSave) {
        setCollapsedSavedIds((prev) => {
          if (!prev.has(n.id)) return prev;
          const next = new Set(prev);
          next.delete(n.id);
          return next;
        });
      }
      reloadNearby();
    } catch (err) {
      log.error('nearby.toggle_failed', err, { toast: err?.message || '切换保存失败' });
    }
  };
  const handleRemoveFor = async (n) => {
    try {
      await removeNearby(worldId, sessionId, n.id);
      setCollapsedSavedIds((prev) => {
        if (!prev.has(n.id)) return prev;
        const next = new Set(prev);
        next.delete(n.id);
        return next;
      });
      reloadNearby();
    } catch (err) {
      log.error('nearby.remove_failed', err, { toast: err?.message || '移除失败' });
    }
  };
  const setSavedCollapsed = (n, collapsed) => {
    setCollapsedSavedIds((prev) => {
      if (collapsed ? prev.has(n.id) : !prev.has(n.id)) return prev;
      const next = new Set(prev);
      if (collapsed) next.add(n.id);
      else next.delete(n.id);
      return next;
    });
  };
  const nearbyToolbarFor = (n) => {
    const isSaved = isNearbySaved(n);
    return (
      <>
        {nearbyToolbarBase}
        <button
          type="button"
          className="we-state-section-reset we-panel-card-action we-panel-card-action--chip"
          onClick={() => handleToggleSavedFor(n)}
          title={isSaved
            ? '取消保存（角色回到当前登场池；下轮如未出场会被自动清理）'
            : '保存到附近角色池（之后只在被召回时进入提示词）'}
        >
          {isSaved ? <><CancelIcon /><span>取消保存</span></> : <><SaveIcon /><span>保存</span></>}
        </button>
        {isSaved && (
          <button
            type="button"
            className="we-state-section-reset we-panel-card-action we-panel-card-action--chip"
            onClick={() => setSavedCollapsed(n, true)}
            title="收起完整 state，仅在底部已保存列表里显示姓名"
          >
            <ChevronUpIcon /><span>收起</span>
          </button>
        )}
        <button
          type="button"
          className="we-state-section-reset we-panel-card-action we-panel-card-action--chip"
          onClick={() => setRemovingNearby(n)}
          title="移除（物理删除，下轮不再注入）"
        >
          <TrashIcon /><span>移除</span>
        </button>
      </>
    );
  };

  const { fullStateChars, demotedSavedNearby } = useMemo(() => {
    const list = Array.isArray(nearby) ? nearby : [];
    const full = [];
    const savedAll = [];
    for (const n of list) {
      const saved = isNearbySaved(n);
      // 默认展开：saved 角色只在用户主动收起后才从顶部 tab 移除
      if (!saved || !collapsedSavedIds.has(n.id)) full.push(n);
      if (saved) savedAll.push(n);
    }
    return { fullStateChars: full, demotedSavedNearby: savedAll };
  }, [nearby, collapsedSavedIds]);

  const emptyNearbyTab = (
    <div className="we-panel-tab-body we-nearby-tab">
      <PanelCard variant="headerless">
        {nearby === null ? (
          <div className="we-skel-stack" aria-busy="true">
            {[80, 65, 70].map((w, i) => (
              <div key={i} className="we-skel we-skel-line" style={{ '--skel-width': `${w}%` }} />
            ))}
          </div>
        ) : nearbyError ? (
          <div className="we-cast-error">
            <p className="we-field-error">{nearbyError}</p>
            <button
              type="button"
              className="we-state-section-reset we-panel-card-action we-panel-card-action--chip"
              onClick={() => setNearbyReloadToken((t) => t + 1)}
            >
              <RefreshIcon /><span>重试</span>
            </button>
          </div>
        ) : (
          <p className="we-cast-empty">暂无附近角色</p>
        )}
      </PanelCard>
    </div>
  );

  // 附近角色区块：每个在场角色一个 tab，没有在场角色时给一个空态 tab
  const extraSections = ({ templateCtx }) => (
    fullStateChars.length > 0
      ? fullStateChars.map((n) => ({
        key: n.id,
        label: n.name || '未命名',
        actions: nearbyToolbarFor(n),
        content: (
          <div className="we-panel-tab-body we-nearby-tab">
            <PanelCard variant="headerless">
              <div className="we-cast-characters">
                <NearbyCharacterBlock
                  worldId={worldId}
                  sessionId={sessionId}
                  nearby={n}
                  onChange={reloadNearby}
                  templateCtx={templateCtx}
                />
              </div>
            </PanelCard>
          </div>
        ),
      }))
      : [{ key: 'nearby', label: '附近', content: emptyNearbyTab, actions: nearbyToolbarBase }]
  );

  const belowTabs = (
    <>
        {demotedSavedNearby.length > 0 && (
          <div className="we-saved-nearby">
            <div className="we-saved-nearby-title">已保存角色</div>
            <ul className="we-saved-nearby-list">
              {demotedSavedNearby.map((n) => {
                const collapsed = collapsedSavedIds.has(n.id);
                return (
                  <li key={n.id} className="we-saved-nearby-item">
                    <span className="we-saved-nearby-name">{n.name || '未命名'}</span>
                    <span className="we-saved-nearby-actions">
                      {collapsed && (
                        <button
                          type="button"
                          className="we-state-section-reset we-saved-nearby-expand"
                          onClick={() => setSavedCollapsed(n, false)}
                          title="展示完整 state（恢复到顶部 tab）"
                          aria-label="展示"
                        >
                          <ChevronDownIcon />
                        </button>
                      )}
                      <button
                        type="button"
                        className="we-state-section-reset we-saved-nearby-cancel"
                        onClick={() => handleToggleSavedFor(n)}
                        title="取消保存（角色回到当前登场池；下轮如未出场会被自动清理）"
                        aria-label="取消保存"
                      >
                        <CancelIcon />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <AnimatePresence>
          {addModalOpen && (
            <AddSavedNearbyModal
              worldId={worldId}
              sessionId={sessionId}
              nearby={nearby ?? []}
              onAdded={() => { setAddModalOpen(false); reloadNearby(); }}
              onClose={() => setAddModalOpen(false)}
            />
          )}
          {makeCardOpen && (
            <MakeCardModal
              worldId={worldId}
              sessionId={sessionId}
              nearby={nearby ?? []}
              onClose={() => setMakeCardOpen(false)}
              onDone={() => { setMakeCardOpen(false); reloadNearby(); }}
            />
          )}
        </AnimatePresence>
        {removingNearby && (
          <ConfirmModal
            title="移除附近角色？"
            message={`「${removingNearby.name || '未命名'}」及其状态将被删除，下轮不再注入，此操作无法撤销。`}
            confirmText="确认移除"
            danger
            onConfirm={async () => {
              const target = removingNearby;
              setRemovingNearby(null);
              await handleRemoveFor(target);
            }}
            onClose={() => setRemovingNearby(null)}
          />
        )}
    </>
  );

  return (
    <SessionStatePanel
      sessionId={sessionId}
      worldId={worldId}
      persona={persona}
      ticks={{ state: stateTick, diary: diaryTick, queued: stateQueuedTick, failed: stateFailedTick }}
      diaryScope="writing"
      classNames={CLASS_NAMES}
      extraSections={extraSections}
      globalActions={addNearbyGlobalAction}
      belowTabs={belowTabs}
      onDiaryInject={onDiaryInject}
    />
  );
}
