import CharacterSeal from '../../../components/chat/CharacterSeal.jsx';
import DragHandle from '../../../components/ui/DragHandle.jsx';
import Icon from '../../../components/ui/Icon.jsx';
import { useTouchFx } from '../../../components/motion/useTouchFx.jsx';
import { useDragAwareClick } from './useDragAwareClick.js';

// ── CharacterCard（内联组件，紧凑变体）──────────────────────────────────────

export function CharacterCard({ char, dragHandleProps, onCardClick, onEdit, onDelete }) {
  const clickProps = useDragAwareClick(onCardClick);
  const touch = useTouchFx();

  return (
    <div
      className="we-character-card we-character-card--compact"
      role="button"
      tabIndex={0}
      onMouseDown={clickProps.onMouseDown}
      onClick={clickProps.onClick}
      onKeyDown={clickProps.onKeyDown}
      {...touch.handlers}
    >
      <div className="we-character-card-body">
        <span className="we-char-drag" {...dragHandleProps}><DragHandle /></span>
        <CharacterSeal character={char} size={32} />
        <div className="we-character-card-info">
          <p className="we-character-card-name">{char.name}</p>
          {char.description ? (
            <p className="we-character-card-desc">{char.description}</p>
          ) : (
            <p className="we-character-card-desc we-character-card-desc--empty">
              为 {char.name} 写一句简介
            </p>
          )}
        </div>
      </div>

      <div
        className="we-character-card-actions"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onEdit}
          className="we-character-card-action-btn"
          title="编辑"
          aria-label="编辑角色"
        >
          <Icon size={16}>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </Icon>
        </button>
        <button
          onClick={onDelete}
          className="we-character-card-action-btn danger"
          title="删除"
          aria-label="删除角色"
        >
          <Icon size={16}>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </Icon>
        </button>
      </div>
      {touch.fx}
    </div>
  );
}
