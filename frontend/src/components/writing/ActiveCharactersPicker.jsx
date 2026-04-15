import { useState, useEffect } from 'react';
import { getAvatarColor, getAvatarUrl } from '../../utils/avatar.js';
import {
  listWorldCharacters,
  listActiveCharacters,
  activateCharacter,
  deactivateCharacter,
} from '../../api/writingSessions.js';

function CharacterRow({ character, isActive, onToggle }) {
  const avatarColor = getAvatarColor(character.id);
  const avatarUrl = getAvatarUrl(character.avatar_path);

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        isActive ? 'bg-clay/15' : 'hover:bg-sand'
      }`}
      onClick={() => onToggle(character)}
    >
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-none overflow-hidden"
        style={{ background: avatarColor }}
      >
        {avatarUrl
          ? <img src={avatarUrl} alt="" className="w-7 h-7 object-cover" />
          : (character.name?.[0] || '?')}
      </div>
      <span className="flex-1 text-sm text-text truncate">{character.name}</span>
      <div className={`w-4 h-4 rounded border flex-none flex items-center justify-center transition-colors ${
        isActive ? 'bg-clay border-clay' : 'border-border'
      }`}>
        {isActive && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2">
            <polyline points="2,5 4,7 8,3" />
          </svg>
        )}
      </div>
    </div>
  );
}

export default function ActiveCharactersPicker({ worldId, sessionId }) {
  const [allCharacters, setAllCharacters] = useState([]);
  const [activeIds, setActiveIds] = useState(new Set());
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!worldId || !sessionId) return;
    Promise.all([
      listWorldCharacters(worldId),
      listActiveCharacters(worldId, sessionId),
    ]).then(([all, active]) => {
      setAllCharacters(all);
      setActiveIds(new Set(active.map((c) => c.id)));
    }).catch(console.error);
  }, [worldId, sessionId]);

  async function handleToggle(character) {
    const isActive = activeIds.has(character.id);
    try {
      if (isActive) {
        await deactivateCharacter(worldId, sessionId, character.id);
        setActiveIds((prev) => {
          const next = new Set(prev);
          next.delete(character.id);
          return next;
        });
      } else {
        await activateCharacter(worldId, sessionId, character.id);
        setActiveIds((prev) => new Set([...prev, character.id]));
      }
    } catch (e) {
      console.error(e);
    }
  }

  const activeCount = activeIds.size;

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-sand transition-colors"
      >
        <span className="font-serif text-xs font-semibold text-text uppercase tracking-wide">
          激活角色
          {activeCount > 0 && (
            <span className="ml-1.5 text-clay">({activeCount})</span>
          )}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          stroke="currentColor" strokeWidth="2"
          className="opacity-40 transition-transform"
          style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        >
          <polyline points="2,4 6,8 10,4" />
        </svg>
      </button>

      {expanded && (
        <div className="px-2 pb-2">
          {allCharacters.length === 0 && (
            <p className="text-xs opacity-30 py-2 text-center">该世界暂无角色</p>
          )}
          {allCharacters.map((character) => (
            <CharacterRow
              key={character.id}
              character={character}
              isActive={activeIds.has(character.id)}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
