import Button from '../../../components/ui/Button.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import SectionTitle from '../../../components/ui/SectionTitle.jsx';
import SortableGrid from '../../../components/ui/SortableGrid.jsx';
import { CharacterCard } from './CharacterCard.jsx';

// ── 中栏：角色 ──────────────────────────────────────────────────────────────

export function CastColumn({
  worldId,
  navigate,
  location,
  loading,
  characters,
  onReorderEnd,
  importingChar,
  charImportRef,
  onImportCharFile,
  onCharacterClick,
  onCharacterNewChat,
  setDeletingChar,
}) {
  return (
    <div className="we-worldhub-cast">
      <div className="we-worldhub-section">
        <SectionTitle
          level="eyebrow"
          rule="under"
          className="we-worldhub-section-header we-on-shell"
          actions={(
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => charImportRef.current?.click()}
                disabled={importingChar}
                title="导入角色卡"
              >
                {importingChar ? '…' : '导入'}
              </Button>
              <input
                ref={charImportRef}
                type="file"
                accept=".json,.wechar.json"
                className="hidden"
                onChange={onImportCharFile}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigate(`/worlds/${worldId}/characters/new`, { state: { backgroundLocation: location } })}
                title="创建角色"
              >
                + 创建
              </Button>
            </>
          )}
        >
          角色
        </SectionTitle>

        {characters.length === 0 ? (
          loading ? null : (
            <EmptyState size="sm" title="暂无角色" hint="点击上方「创建」添加第一个角色。" />
          )
        ) : (
          <SortableGrid
            items={characters}
            onReorderEnd={onReorderEnd}
            className="we-character-grid"
            renderItem={(char, sortableProps) => (
              <CharacterCard
                char={char}
                {...sortableProps}
                onCardClick={() => onCharacterClick(char)}
                onNewChat={() => onCharacterNewChat(char)}
                onEdit={() => navigate(`/characters/${char.id}/edit`, { state: { backgroundLocation: location } })}
                onDelete={() => setDeletingChar(char)}
              />
            )}
          />
        )}
      </div>

    </div>
  );
}
