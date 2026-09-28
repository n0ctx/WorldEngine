import { SortableList } from '../../../components';
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
        <div className="we-worldhub-section-header">
          <span className="we-worldhub-section-title">角色</span>
          <div className="we-characters-col-actions">
            <button
              onClick={() => charImportRef.current?.click()}
              disabled={importingChar}
              className="we-characters-col-btn"
              title="导入角色卡"
            >
              {importingChar ? '…' : '导入'}
            </button>
            <input
              ref={charImportRef}
              type="file"
              accept=".json,.wechar.json"
              className="hidden"
              onChange={onImportCharFile}
            />
            <button
              onClick={() => navigate(`/worlds/${worldId}/characters/new`, { state: { backgroundLocation: location } })}
              className="we-characters-col-btn we-characters-col-btn--primary"
              title="创建角色"
            >
              + 创建
            </button>
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
