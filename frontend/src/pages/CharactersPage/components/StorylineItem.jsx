import Icon from '../../../components/ui/Icon.jsx';
import IconButton from '../../../components/ui/IconButton.jsx';
import StorylineModeBadge from '../../../components/session/StorylineModeBadge.jsx';
import { relativeTime } from '../../../core/utils/time.js';

// ── StorylineItem / ContinueCard（内联组件）─────────────────────────────────

// 悬停或键盘聚焦卡片时浮现；按键与点击都不冒泡到卡片，避免同时触发「打开」
function StorylineDeleteButton({ onDelete }) {
  return (
    <IconButton
      size="sm"
      variant="danger"
      label="删除故事线"
      title="删除"
      className="we-storyline-delete"
      onClick={(e) => { e.stopPropagation(); onDelete(); }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Icon size={16}>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v6M14 11v6" />
        <path d="M9 6V4h6v2" />
      </Icon>
    </IconButton>
  );
}

export function StorylineItem({ item, title, onClick, onDelete }) {
  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <div
      className="we-storyline-item"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <StorylineModeBadge mode={item.mode} />
      <div className="we-storyline-item-info">
        <p className="we-storyline-item-title" title={title}>{title}</p>
        {item.last_message && (
          <p className="we-storyline-item-snippet">{item.last_message}</p>
        )}
      </div>
      <span className="we-storyline-item-time">{relativeTime(item.updated_at)}</span>
      <StorylineDeleteButton onDelete={onDelete} />
    </div>
  );
}

export function ContinueCard({ item, title, onClick, onDelete }) {
  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <div
      className="we-storyline-continue"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="we-storyline-continue-head">
        <span className="we-storyline-continue-label">继续上次</span>
        <StorylineModeBadge mode={item.mode} />
        <StorylineDeleteButton onDelete={onDelete} />
      </div>
      <p className="we-storyline-continue-title">{title}</p>
      {item.last_message && (
        <p className="we-storyline-continue-snippet">{item.last_message}</p>
      )}
      <p className="we-storyline-continue-time">{relativeTime(item.updated_at)}</p>
    </div>
  );
}
