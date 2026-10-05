import Button from '../../../components/ui/Button.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import SectionTitle from '../../../components/ui/SectionTitle.jsx';
import { storylineTitle } from '../../../core/hooks/storyline.js';
import { StorylineItem, ContinueCard } from './StorylineItem.jsx';

// ── 左栏：故事线 ─────────────────────────────────────────────────────────

export function StorylineColumn({ loading, timeline, charactersById, onCreateStoryline, onStorylineClick, onStorylineDelete }) {
  const continueItem = timeline.length > 0 ? timeline[0] : null;
  const restTimeline = timeline.length > 1 ? timeline.slice(1) : [];

  return (
    <div className="we-worldhub-main">
      <SectionTitle
        level="eyebrow"
        rule="under"
        className="we-worldhub-section-header we-on-shell"
        actions={(
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onCreateStoryline}
            title="新建写作故事线"
          >
            + 写作
          </Button>
        )}
      >
        故事线
      </SectionTitle>

      {loading ? null : timeline.length === 0 ? (
        <EmptyState
          size="sm"
          className="we-storyline-empty"
          title="还没有故事线"
          hint="点「+ 写作」开始写作，或点右侧的角色开始对话。"
        />
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
