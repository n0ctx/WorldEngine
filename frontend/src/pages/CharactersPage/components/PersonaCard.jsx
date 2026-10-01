import CharacterSeal from '../../../components/chat/CharacterSeal.jsx';
import DragHandle from '../../../components/ui/DragHandle.jsx';
import Icon from '../../../components/ui/Icon.jsx';
import IconButton from '../../../components/ui/IconButton.jsx';
import { useDragAwareClick } from './useDragAwareClick.js';

// ── PersonaCard（内联组件）─────────────────────────────────────────────────

export function PersonaCard({ persona, dragHandleProps, onActivate, onEdit, onDelete, onCardClick }) {
  const isActive = !!persona.is_active;
  // 写作 session 与玩家卡强绑定：只有激活的玩家卡可点击进入写作页
  const clickProps = useDragAwareClick(isActive ? onCardClick : undefined);

  return (
    <div
      className={`we-persona-card${isActive ? ' we-persona-card--active' : ' we-persona-card--inactive'}`}
      role={isActive ? 'button' : undefined}
      tabIndex={isActive ? 0 : undefined}
      onMouseDown={isActive ? clickProps.onMouseDown : undefined}
      onClick={isActive ? clickProps.onClick : undefined}
      onKeyDown={isActive ? clickProps.onKeyDown : undefined}
      aria-disabled={isActive ? undefined : true}
      title={isActive ? undefined : '先激活该玩家卡再进入写作'}
      style={isActive ? undefined : { cursor: 'not-allowed' }}
    >
      <div className="we-character-card-body">
        {dragHandleProps && <span className="we-char-drag" {...dragHandleProps}><DragHandle /></span>}
        <CharacterSeal character={persona} size={32} />
        <div className="we-character-card-info">
          <div className="we-persona-card-name-row">
            <p className="we-character-card-name">{persona.name || '（未命名玩家）'}</p>
            {isActive && <span className="we-persona-card__badge">激活</span>}
          </div>
        </div>
      </div>

      <div
        className="we-character-card-actions"
        onClick={(e) => e.stopPropagation()}
      >
        {!isActive && (
          <button
            onClick={onActivate}
            className="we-persona-card__activate-btn"
            title="设为激活（对话用）"
            aria-label="激活玩家卡"
          >
            <Icon size={16}>
              <polyline points="20 6 9 17 4 12" />
            </Icon>
          </button>
        )}
        <IconButton
          size="sm"
          label="编辑玩家卡"
          title="编辑"
          onClick={onEdit}
        >
          <Icon size={16}>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </Icon>
        </IconButton>
        <IconButton
          size="sm"
          variant="danger"
          label="删除玩家卡"
          title="删除"
          onClick={onDelete}
          disabled={persona._isLast}
        >
          <Icon size={16}>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </Icon>
        </IconButton>
      </div>
    </div>
  );
}
