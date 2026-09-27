import { relativeTime } from '../../../core/utils/time.js';

// ── StorylineItem / ContinueCard（内联组件）─────────────────────────────────

function StorylineModeBadge({ mode }) {
  return (
    <span className={`we-storyline-mode we-storyline-mode--${mode}`}>
      {mode === 'writing' ? '写作' : '对话'}
    </span>
  );
}

export function StorylineItem({ item, title, onClick }) {
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
      <span className="we-storyline-quick" aria-hidden="true">→</span>
    </div>
  );
}

export function ContinueCard({ item, title, onClick }) {
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
      </div>
      <p className="we-storyline-continue-title">{title}</p>
      {item.last_message && (
        <p className="we-storyline-continue-snippet">{item.last_message}</p>
      )}
      <p className="we-storyline-continue-time">{relativeTime(item.updated_at)}</p>
    </div>
  );
}
