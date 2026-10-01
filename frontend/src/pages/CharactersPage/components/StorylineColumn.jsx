import Button from '../../../components/ui/Button.jsx';
import { storylineTitle } from '../../../core/hooks/storyline.js';
import { StorylineItem, ContinueCard } from './StorylineItem.jsx';

// ── 左栏：故事线 ─────────────────────────────────────────────────────────

export function StorylineColumn({ loading, timeline, charactersById, onCreateStoryline, onStorylineClick, onStorylineDelete }) {
  const continueItem = timeline.length > 0 ? timeline[0] : null;
  const restTimeline = timeline.length > 1 ? timeline.slice(1) : [];

  return (
    <div className="we-worldhub-main">
      <div className="we-worldhub-section-header we-on-shell">
        <span className="we-worldhub-section-title">故事线</span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={onCreateStoryline}
          title="新建写作故事线"
        >
          + 新建
        </Button>
      </div>

      {loading ? null : timeline.length === 0 ? (
        <div className="we-storyline-empty">
          <p className="we-characters-empty-text">
            还没有故事线，点击「+ 新建」开始写作，或在右侧选择一个角色开始对话
          </p>
        </div>
      ) : (
        <div className="we-storyline-body">
          {continueItem && (
            <ContinueCard
              item={continueItem}
              title={storylineTitle(continueItem, charactersById)}
              onClick={() => onStorylineClick(continueItem)}
              onDelete={() => onStorylineDelete(continueItem)}
            />
          )}
          {restTimeline.length > 0 && (
            <div className="we-storyline-list">
              {restTimeline.map((item) => (
                <StorylineItem
                  key={item.id}
                  item={item}
                  title={storylineTitle(item, charactersById)}
                  onClick={() => onStorylineClick(item)}
                  onDelete={() => onStorylineDelete(item)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
