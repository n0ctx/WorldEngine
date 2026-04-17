import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import CharacterSeal from './CharacterSeal.jsx';
import StatusSection from './StatusSection.jsx';
import ModalShell from '../ui/ModalShell.jsx';
import { getCharactersByWorld } from '../../api/characters.js';
import { getCharacterStateValues } from '../../api/characterStateValues.js';
import { activateCharacter, deactivateCharacter } from '../../api/writingSessions.js';
import { getAvatarColor } from '../../utils/avatar.js';

function CharacterBlock({ worldId, sessionId, char, expanded, onToggle, onRemove }) {
  const [stateValues, setStateValues] = useState(null);

  useEffect(() => {
    if (!expanded || !char?.id) return;
    setStateValues(null);
    getCharacterStateValues(char.id)
      .then(setStateValues)
      .catch(() => setStateValues([]));
  }, [char?.id, expanded]);

  return (
    <div className="we-cast-character-block">
      <div
        className="we-cast-char-title"
        onClick={onToggle}
      >
        <span
          className="we-cast-char-dot"
          style={{ background: getAvatarColor(char.id) }}
        />
        <span className="we-cast-char-name">{char.name}</span>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          stroke="currentColor" strokeWidth="2"
          style={{
            transition: 'transform 180ms',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            color: 'var(--we-ink-faded)',
            flexShrink: 0,
          }}
        >
          <polyline points="3,2 7,5 3,8" />
        </svg>
        <button
          className="we-cast-char-remove"
          onClick={(e) => { e.stopPropagation(); onRemove(char.id); }}
          title={`移除 ${char.name}`}
        >
          ✕
        </button>
      </div>
      {expanded && (
        <div className="we-cast-char-body">
          <StatusSection title="" rows={stateValues} pinnedName={null} />
        </div>
      )}
    </div>
  );
}

function AddCharacterModal({ worldId, sessionId, activeCharacters, onAdd, onClose }) {
  const [allChars, setAllChars] = useState([]);
  const [adding, setAdding] = useState(null);
  const activeIds = new Set(activeCharacters.map((c) => c.id));

  useEffect(() => {
    getCharactersByWorld(worldId).then(setAllChars).catch(console.error);
  }, [worldId]);

  const available = allChars.filter((c) => !activeIds.has(c.id));

  async function handleAdd(charId) {
    setAdding(charId);
    try {
      await activateCharacter(worldId, sessionId, charId);
      const char = allChars.find((c) => c.id === charId);
      onAdd(char);
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(null);
    }
  }

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-sm">
      <div style={{ padding: '16px 20px 6px' }}>
        <p style={{
          fontFamily: 'var(--we-font-display)',
          fontSize: 15,
          fontStyle: 'italic',
          color: 'var(--we-ink-primary)',
          marginBottom: 12,
        }}>
          添加角色
        </p>
        {available.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--we-ink-faded)', fontStyle: 'italic', padding: '8px 0 12px' }}>
            所有角色均已激活
          </p>
        )}
        {available.map((char) => (
          <div
            key={char.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0',
              borderBottom: '1px solid var(--we-paper-shadow)',
            }}
          >
            <CharacterSeal character={char} size={32} />
            <span style={{
              flex: 1,
              fontFamily: 'var(--we-font-serif)',
              fontSize: 14,
              color: 'var(--we-ink-primary)',
            }}>
              {char.name}
            </span>
            <button
              onClick={() => handleAdd(char.id)}
              disabled={adding === char.id}
              style={{
                padding: '3px 10px',
                border: '1.5px dashed var(--we-vermilion)',
                borderRadius: 3,
                background: 'none',
                color: 'var(--we-vermilion)',
                fontFamily: 'var(--we-font-serif)',
                fontSize: 12,
                cursor: 'pointer',
                opacity: adding === char.id ? 0.5 : 1,
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => { if (adding !== char.id) e.currentTarget.style.background = 'var(--we-vermilion-bg)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            >
              {adding === char.id ? '…' : '添加'}
            </button>
          </div>
        ))}
      </div>
      <div style={{ padding: '10px 20px 16px', display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onClose}
          style={{
            fontFamily: 'var(--we-font-serif)',
            fontSize: 13,
            color: 'var(--we-ink-faded)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          关闭
        </button>
      </div>
    </ModalShell>
  );
}

export default function CastPanel({ worldId, sessionId, activeCharacters, onActiveCharactersChange }) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState([]);

  useEffect(() => {
    if (activeCharacters.length > 0) {
      setExpandedIds([activeCharacters[0].id]);
    } else {
      setExpandedIds([]);
    }
  }, [activeCharacters.length]);

  function toggleExpand(charId) {
    setExpandedIds((prev) =>
      prev.includes(charId) ? prev.filter((id) => id !== charId) : [...prev, charId]
    );
  }

  async function handleRemove(charId) {
    try {
      await deactivateCharacter(worldId, sessionId, charId);
      onActiveCharactersChange((prev) => prev.filter((c) => c.id !== charId));
    } catch (e) {
      console.error(e);
    }
  }

  function handleAdd(char) {
    onActiveCharactersChange((prev) => [...prev, char]);
    setAddModalOpen(false);
  }

  return (
    <div
      className="we-cast-panel"
      style={{
        width: '280px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--we-paper-aged)',
        borderLeft: '1px solid var(--we-paper-shadow)',
        overflowY: 'auto',
        position: 'relative',
        padding: 14,
      }}
    >
      {/* 左侧书脊渐变 */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 12,
        background: 'var(--we-spine-shadow-left)',
        pointerEvents: 'none',
        zIndex: 2,
      }} />

      {/* CAST 标题 + 印章行 */}
      <div className="we-cast-header">
        <p style={{
          fontFamily: 'var(--we-font-display)',
          fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase',
          color: 'var(--we-ink-faded)',
          borderBottom: '1px solid var(--we-paper-shadow)',
          paddingBottom: 6, marginBottom: 10,
          margin: '0 0 10px',
        }}>
          Cast
        </p>

        {/* 印章行 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
          {activeCharacters.map((char) => (
            <div
              key={char.id}
              style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              <CharacterSeal character={char} size={44} />
              <span style={{
                fontSize: 8, fontStyle: 'italic', color: 'var(--we-ink-faded)',
                maxWidth: 44, overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', textAlign: 'center', marginTop: 3,
              }}>
                {char.name}
              </span>
              <button
                onClick={() => handleRemove(char.id)}
                title={`移除 ${char.name}`}
                style={{
                  position: 'absolute', top: -2, right: -4,
                  fontSize: 9, color: 'var(--we-ink-faded)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  lineHeight: 1, padding: 2,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--we-vermilion)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--we-ink-faded)'; }}
              >
                ✕
              </button>
            </div>
          ))}

          {/* 添加按钮 */}
          <button
            onClick={() => setAddModalOpen(true)}
            style={{
              width: 44, height: 44,
              border: '1px dashed var(--we-vermilion)',
              borderRadius: 'var(--we-radius-sm)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, color: 'var(--we-vermilion)',
              background: 'none', cursor: 'pointer',
              transition: 'background 0.12s',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--we-vermilion-bg)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            title="添加角色"
          >
            ＋
          </button>
        </div>
      </div>

      {/* 金箔分隔线 */}
      <div style={{
        height: 1,
        background: 'var(--we-gold-leaf)',
        opacity: 0.4,
        margin: '12px -14px',
      }} />

      {/* 逐角色状态区 */}
      <div className="we-cast-characters" style={{ flex: 1 }}>
        {activeCharacters.map((char) => (
          <CharacterBlock
            key={char.id}
            worldId={worldId}
            sessionId={sessionId}
            char={char}
            expanded={expandedIds.includes(char.id)}
            onToggle={() => toggleExpand(char.id)}
            onRemove={handleRemove}
          />
        ))}
        {activeCharacters.length === 0 && (
          <p style={{
            fontSize: 12, fontStyle: 'italic',
            color: 'var(--we-ink-faded)',
            textAlign: 'center', paddingTop: 12,
          }}>
            暂无激活角色
          </p>
        )}
      </div>

      <AnimatePresence>
        {addModalOpen && (
          <AddCharacterModal
            worldId={worldId}
            sessionId={sessionId}
            activeCharacters={activeCharacters}
            onAdd={handleAdd}
            onClose={() => setAddModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
