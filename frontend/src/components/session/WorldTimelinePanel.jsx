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
 * 编辑标题 / 删除会话：只对「与当前页面同模式」的条目提供内联操作——组件自己按 item.mode
 * 选对应的删除接口（chat 用 sessions.js 的 deleteSession，writing 用 writing-sessions.js 的
 * deleteWritingSession），重命名两种模式共用同一个通用接口（renameSession，按 session id 不分
 * mode）。跨模式条目不给内联编辑：点它们直接跳转过去，到了对应页面本来就能编辑/删除，
 * 「保留原有能力」不等于「所有能力都要能在同一个列表里对所有模式做」。
 *
 * 新建会话（页面头部按钮）、AI 重新生成标题（handleRetitle）仍在各页面的 stream hook 里，
 * 会通过 chatSessionListBridge / writingSessionListBridge 把结果广播过来，本组件按 currentMode
 * 订阅对应的 bridge，把新会话 / 新标题合并进时间线，不用整表重新拉取。
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';
import { getWorldTimeline, renameSession, deleteSession } from '../../core/api/sessions.js';
import { getCharactersByWorld } from '../../core/api/characters.js';
import { deleteWritingSession } from '../../core/api/writing-sessions.js';
import { chatSessionListBridge, writingSessionListBridge } from '../../core/utils/session-list-bridge.js';
import useStore from '../../core/state/index.js';
import { formatDateLiterary } from '../../core/utils/date-format.js';
import { relativeTime } from '../../core/utils/time.js';
import { log } from '../../core/utils/logger.js';
import { isImeComposing } from '../../core/utils/ime.js';

function StorylineModeBadge({ mode }) {
  return (
    <span className={`we-storyline-mode we-storyline-mode--${mode}`}>
      {mode === 'writing' ? '写作' : '对话'}
    </span>
  );
}

function TimelineItem({ item, title, isActive, editable, onClick, onRename, onDelete }) {
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
    e.stopPropagation();
    if (isImeComposing(e)) return;
    if (e.key === 'Enter') { e.preventDefault(); confirmEdit(); }
    if (e.key === 'Escape') cancelEdit();
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
    >
      <StorylineModeBadge mode={item.mode} />
      <div className="we-storyline-item-info">
        {editing ? (
          <input
            ref={inputRef}
            className="we-session-item__edit-input"
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
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(item.id); setConfirmDelete(false); }}
                className="we-session-item__delete-confirm"
              >
                删除
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                className="we-session-item__cancel-confirm"
              >
                取消
              </button>
            </div>
          ) : (
            <div className="we-session-item__btn-group">
              <button
                onClick={startEdit}
                className="we-session-item__icon-btn"
                title="编辑标题"
                aria-label="编辑会话标题"
              >
                <Icon size={16}>
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </Icon>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                className="we-session-item__icon-btn"
                title="删除会话"
                aria-label="删除会话"
              >
                <Icon size={16}>
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4h6v2" />
                </Icon>
              </button>
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
  const navigate = useNavigate();
  const setCurrentCharacterId = useStore((s) => s.setCurrentCharacterId);
  const setCurrentSessionId = useStore((s) => s.setCurrentSessionId);
  const setCurrentWritingSessionId = useStore((s) => s.setCurrentWritingSessionId);
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
      if (item.mode === 'writing') {
        await deleteWritingSession(worldId, item.id);
      } else {
        await deleteSession(item.id);
      }
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

  function storylineTitle(item) {
    if (item.title) return item.title;
    if (item.mode === 'chat') {
      const c = charactersById[item.character_id];
      return c ? `与 ${c.name} 的对话` : '对话';
    }
    return `${formatDateLiterary(item.created_at)}的写作`;
  }

  function handleItemClick(item) {
    if (item.mode === 'writing') {
      setCurrentWritingSessionId(item.id);
      navigate(`/worlds/${worldId}/writing`);
    } else {
      setCurrentCharacterId(item.character_id);
      setCurrentSessionId(item.id);
      navigate(`/characters/${item.character_id}/chat`);
    }
  }

  return (
    <div className="we-session-list-panel">
      <div className="we-session-list-head">
        {headerRight}
      </div>

      <div className="we-session-list-scroll">
        {loadError ? (
          <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
            <p className="text-sm text-[var(--we-color-text-danger)]">{loadError}</p>
            <button
              type="button"
              className="we-panel-card-action we-panel-card-action--chip"
              onClick={() => setRetryToken((t) => t + 1)}
            >
              重试
            </button>
          </div>
        ) : !loading && timeline.length === 0 ? (
          <p className="we-session-list-empty">暂无故事线</p>
        ) : (
          <div className="we-storyline-list we-storyline-list--timeline">
            {timeline.map((item) => (
              <TimelineItem
                key={`${item.mode}-${item.id}`}
                item={item}
                title={storylineTitle(item)}
                isActive={item.mode === currentMode && item.id === currentSessionId}
                editable={item.mode === currentMode}
                onClick={() => handleItemClick(item)}
                onRename={(id, title) => handleRenameItem(item, title)}
                onDelete={() => handleDeleteItem(item)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
