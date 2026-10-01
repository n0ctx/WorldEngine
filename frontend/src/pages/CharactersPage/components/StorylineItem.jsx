import Card from '../../../components/ui/Card.jsx';
import { Trash2 } from 'lucide-react';
import IconButton from '../../../components/ui/IconButton.jsx';
import SectionTitle from '../../../components/ui/SectionTitle.jsx';
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
      <Trash2 size={16} />
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
    <Card
      density="compact"
      interactive
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
    </Card>
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
    <Card
      density="spacious"
      interactive
      className="we-storyline-continue"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="we-storyline-continue-head">
        <SectionTitle level="eyebrow" className="we-storyline-continue-label">继续上次</SectionTitle>
        <StorylineModeBadge mode={item.mode} />
        <StorylineDeleteButton onDelete={onDelete} />
      </div>
      <p className="we-storyline-continue-title">{title}</p>
      {item.last_message && (
        <p className="we-storyline-continue-snippet">{item.last_message}</p>
      )}
      <p className="we-storyline-continue-time">{relativeTime(item.updated_at)}</p>
    </Card>
  );
}
