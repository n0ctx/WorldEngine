/* 世界层「故事线」时间线的对话页/写作页复用版本。
 *
 * 世界层（CharactersPage）已经把 chat + writing 会话混编成一条时间线；对话页/写作页原先各自
 * 只展开本模式的单列表，导致「从一条对话跳到一条写作」要先经面包屑回世界层再选，多一步。
 * 这个组件把同一条 getWorldTimeline() 时间线搬进两个页面的左侧窄轨，点任意一条直接跳转到
 * 对应页面 + 会话，当前所在的那条给选中态——和世界层看到的是同一份列表、同样的模式标记。
 *
 * 「新建」不在这个组件里：对话页新建的是「与当前角色的新对话」，写作页新建的是「新写作会话」，
 * 语义各自绑定当前页面上下文，跟世界层「+ 新建」（只能新建写作，因为没有角色上下文）不是一回事。
 * 所以头部的新建按钮由调用方通过 headerRight 传入，组件只负责渲染时间线本身。
 *
 * 编辑标题 / 删除会话：只对「与当前页面同模式」的条目提供内联操作——删除经 deleteStoryline
 * 按 item.mode 选对应接口，重命名两种模式共用同一个通用接口（renameSession，按 session id 不分
 * mode）。跨模式条目不给内联编辑：点它们直接跳转过去，到了对应页面本来就能编辑/删除，
 * 「保留原有能力」不等于「所有能力都要能在同一个列表里对所有模式做」。
 *
 * 新建会话（页面头部按钮）、AI 重新生成标题（handleRetitle）仍在各页面的 stream hook 里，
 * 会通过 chatSessionListBridge / writingSessionListBridge 把结果广播过来，本组件按 currentMode
 * 订阅对应的 bridge，把新会话 / 新标题合并进时间线，不用整表重新拉取。
 */
import { Button, EmptyState, IconButton, Input } from '../index.js';
import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { PencilLine, Trash2 } from 'lucide-react';
import StorylineModeBadge from './StorylineModeBadge.jsx';
import { getWorldTimeline, renameSession } from '../../core/api/sessions.js';
import { getCharactersByWorld } from '../../core/api/characters.js';
import { chatSessionListBridge, writingSessionListBridge } from '../../core/utils/session-list-bridge.js';
import { relativeTime } from '../../core/utils/time.js';
import { log } from '../../core/utils/logger.js';
import { handleInlineRenameKeyDown } from '../../core/utils/inline-rename.js';
import { STAGGER } from '../../core/utils/motion.js';
import { useMotion } from '../../core/hooks/useMotion.js';
import { storylineTitle, useOpenStoryline, deleteStoryline } from '../../core/hooks/storyline.js';

const MotionDiv = motion.div;
const MotionSpan = motion.span;

// 入场逐条浮现只排前几条：列表长时后面的条目不再额外等待
const STAGGER_CAP = 8;

function TimelineItem({ item, title, index, isActive, editable, onClick, onRename, onDelete }) {
  const motionPrefs = useMotion();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hovered, setHovered] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }

  function startEdit(e) {
    e.stopPropagation();
    setDraft(item.title || '');
    setEditing(true);
  }

  function confirmEdit() {
    const trimmed = draft.trim();
    onRename(item.id, trimmed || null);
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
  }

  function handleEditKeyDown(e) {
    // 外层条目把 Enter/空格当作「打开会话」，编辑框的按键不能冒泡上去
    handleInlineRenameKeyDown(e, confirmEdit, cancelEdit, true);
  }

  return (
    <div
      className={`we-storyline-item${isActive ? ' we-storyline-item--active' : ''}`}
      onClick={() => !editing && onClick()}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-current={isActive ? 'true' : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmDelete(false); }}
      style={motionPrefs.reduced ? undefined : { animationDelay: `${Math.min(index, STAGGER_CAP) * STAGGER}s` }}
    >
      {/* 当前会话的托底亮片：切换会话时从旧卡片滑到新卡片 */}
      {isActive && (
        <MotionSpan
          layoutId="we-storyline-highlight"
          className="we-storyline-highlight"
          aria-hidden="true"
          transition={motionPrefs.transition('move')}
        />
      )}
      <StorylineModeBadge mode={item.mode} />
      <div className="we-storyline-item-info">
        {editing ? (
          <Input
            ref={inputRef}
            size="sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={confirmEdit}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <p className="we-storyline-item-title" title={title}>{title}</p>
        )}
        {!editing && item.last_message && (
          <p className="we-storyline-item-snippet">{item.last_message}</p>
        )}
      </div>

      {editable && !editing && hovered ? (
        <div className="we-session-item__actions" onClick={(e) => e.stopPropagation()}>
          {confirmDelete ? (
            <div className="we-session-item__confirm-group">
              <Button
                variant="danger"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onDelete(item.id); setConfirmDelete(false); }}
              >
                删除
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
              >
                取消
              </Button>
            </div>
          ) : (
            <div className="we-session-item__btn-group">
              <IconButton size="sm" label="编辑会话标题" title="编辑标题" onClick={startEdit}>
                <PencilLine size={16} />
              </IconButton>
              <IconButton
                size="sm"
                variant="danger"
                label="删除会话"
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
          )}
        </div>
      ) : (
        <span className="we-storyline-item-time">{relativeTime(item.updated_at)}</span>
      )}
    </div>
  );
}

/**
 * @param {string} worldId
 * @param {'chat'|'writing'} currentMode 当前页面所在模式，用于给命中项打选中态，也决定订阅哪个
 *   session-list-bridge（chatSessionListBridge / writingSessionListBridge）
 * @param {string|null} currentSessionId 当前活跃会话 id
 * @param {React.ReactNode} [headerRight] 头部右侧（各页自己的「新建」按钮）
 * @param {() => void} [onActiveSessionDeleted] 内联删除的正是当前打开的会话时回调，让页面清空/重置当前会话
 * @param {(title: string|null) => void} [onActiveSessionRenamed] 内联重命名的正是当前打开的会话时回调，让页面同步 currentSession.title
 */
export default function WorldTimelinePanel({
  worldId,
  currentMode,
  currentSessionId,
  headerRight = null,
  onActiveSessionDeleted = null,
  onActiveSessionRenamed = null,
}) {
  const bridge = currentMode === 'writing' ? writingSessionListBridge : chatSessionListBridge;

  const [timeline, setTimeline] = useState([]);
  const [charactersById, setCharactersById] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!worldId) return;
    let cancelled = false;

    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setLoadError(null);

      try {
        const [tl, chars] = await Promise.all([getWorldTimeline(worldId), getCharactersByWorld(worldId)]);
        if (cancelled) return;
        setTimeline(tl);
        const map = {};
        for (const c of chars) map[c.id] = c;
        setCharactersById(map);
      } catch (err) {
        if (cancelled) return;
        setTimeline([]);
        setLoadError('故事线加载失败');
        log.error('timeline.panel.load_failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [worldId, retryToken]);

  // 订阅页面 stream hook 广播的「新建会话」/「AI 重新生成标题」，合并进当前时间线，避免整表重拉。
  useEffect(() => {
    bridge.updateTitle = (sessionId, title) => {
      setTimeline((prev) => prev.map((it) => (it.id === sessionId ? { ...it, title } : it)));
    };
    bridge.addSession = (session) => {
      setTimeline((prev) => [session, ...prev.filter((it) => it.id !== session.id)]);
    };
    return () => {
      bridge.updateTitle = null;
      bridge.addSession = null;
    };
  }, [bridge]);

  async function handleDeleteItem(item) {
    try {
      await deleteStoryline(worldId, item);
      setTimeline((prev) => prev.filter((it) => it.id !== item.id));
      if (item.mode === currentMode && item.id === currentSessionId) {
        onActiveSessionDeleted?.();
      }
    } catch (err) {
      log.error('timeline.panel.delete_failed', err, { toast: err.message || '删除会话失败' });
    }
  }

  async function handleRenameItem(item, title) {
    try {
      const updated = await renameSession(item.id, title);
      setTimeline((prev) => prev.map((it) => (it.id === item.id ? { ...it, title: updated.title } : it)));
      if (item.mode === currentMode && item.id === currentSessionId) {
        onActiveSessionRenamed?.(updated.title);
      }
    } catch (err) {
      log.error('timeline.panel.rename_failed', err, { toast: err.message || '重命名会话失败' });
    }
  }

  const handleItemClick = useOpenStoryline(worldId);

  return (
    <div className="we-session-list-panel">
      <div className="we-session-list-head">
        {headerRight}
      </div>

      <MotionDiv layoutScroll className="we-session-list-scroll">
        {loadError ? (
          <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
            <p className="we-type-ui text-[var(--we-color-status-danger)]">{loadError}</p>
            <Button type="button" size="sm" variant="secondary" onClick={() => setRetryToken((t) => t + 1)}>
              重试
            </Button>
          </div>
        ) : !loading && timeline.length === 0 ? (
          <EmptyState size="sm" title="暂无故事线" />
        ) : (
          <div className="we-storyline-list we-storyline-list--timeline">
            {timeline.map((item, index) => (
              <TimelineItem
                key={`${item.mode}-${item.id}`}
                item={item}
                title={storylineTitle(item, charactersById)}
                index={index}
                isActive={item.mode === currentMode && item.id === currentSessionId}
                editable={item.mode === currentMode}
                onClick={() => handleItemClick(item)}
                onRename={(id, title) => handleRenameItem(item, title)}
                onDelete={() => handleDeleteItem(item)}
              />
            ))}
          </div>
        )}
      </MotionDiv>
    </div>
  );
}
