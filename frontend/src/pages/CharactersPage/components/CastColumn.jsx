import { SortableList } from '../../../components';
import Button from '../../../components/ui/Button.jsx';
import { CharacterCard } from './CharacterCard.jsx';

// ── 中栏：角色 ──────────────────────────────────────────────────────────────

export function CastColumn({
  worldId,
  navigate,
  location,
  loading,
  characters,
  setCharacters,
  onReorderEnd,
  importingChar,
  charImportRef,
  onImportCharFile,
  onCharacterClick,
  setDeletingChar,
}) {
  return (
    <div className="we-worldhub-cast">
      <div className="we-worldhub-section">
        <div className="we-worldhub-section-header we-on-shell">
          <span className="we-worldhub-section-title">角色</span>
          <div className="we-characters-col-actions">
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
          </div>
        </div>

        <div className="we-characters-col-list we-worldhub-char-list">
          {characters.length === 0 ? (
            loading ? null : (
              <div className="we-characters-empty">
                <p className="we-characters-empty-text">暂无角色，点击上方新建</p>
              </div>
            )
          ) : (
            <SortableList
              items={characters}
              onReorder={setCharacters}
              onReorderEnd={onReorderEnd}
              useHandle={true}
              renderItem={(char, dragHandleProps) => (
                <CharacterCard
                  char={char}
                  dragHandleProps={dragHandleProps}
                  onCardClick={() => onCharacterClick(char)}
                  onEdit={() => navigate(`/characters/${char.id}/edit`, { state: { backgroundLocation: location } })}
                  onDelete={() => setDeletingChar(char)}
                />
              )}
              className="we-characters-list"
            />
          )}
        </div>
      </div>

    </div>
  );
}
