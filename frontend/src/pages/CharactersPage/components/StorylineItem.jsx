import Icon from '../../../components/ui/Icon.jsx';
import { relativeTime } from '../../../core/utils/time.js';

// ── StorylineItem / ContinueCard（内联组件）─────────────────────────────────

function StorylineModeBadge({ mode }) {
  return (
    <span className={`we-storyline-mode we-storyline-mode--${mode}`}>
      {mode === 'writing' ? '写作' : '对话'}
    </span>
  );
}

// 悬停或键盘聚焦卡片时浮现；按键与点击都不冒泡到卡片，避免同时触发「打开」
function StorylineDeleteButton({ onDelete }) {
  return (
    <button
      type="button"
      className="we-character-card-action-btn danger we-storyline-delete"
      onClick={(e) => { e.stopPropagation(); onDelete(); }}
      onKeyDown={(e) => e.stopPropagation()}
      title="删除"
      aria-label="删除故事线"
    >
      <Icon size={16}>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v6M14 11v6" />
        <path d="M9 6V4h6v2" />
      </Icon>
    </button>
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
