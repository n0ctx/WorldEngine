import Badge from '../../../components/ui/Badge.jsx';
import Card from '../../../components/ui/Card.jsx';
import CharacterSeal from '../../../components/chat/CharacterSeal.jsx';
import DragHandle from '../../../components/ui/DragHandle.jsx';
import { Check, PencilLine, X } from 'lucide-react';
import IconButton from '../../../components/ui/IconButton.jsx';
import { useDragAwareClick } from './useDragAwareClick.js';

// ── PersonaCard（内联组件）─────────────────────────────────────────────────

export function PersonaCard({ persona, dragHandleProps, onActivate, onEdit, onDelete, onCardClick }) {
  const isActive = !!persona.is_active;
  // 写作 session 与玩家卡强绑定：只有激活的玩家卡可点击进入写作页
  const clickProps = useDragAwareClick(isActive ? onCardClick : undefined);

  return (
    <Card
      density="compact"
      interactive={isActive}
      selected={isActive}
      className="we-persona-card"
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
            {isActive && <Badge tone="accent">激活</Badge>}
          </div>
        </div>
      </div>

      <div
        className="we-character-card-actions"
        onClick={(e) => e.stopPropagation()}
      >
        {!isActive && (
          <IconButton
            size="sm"
            label="激活玩家卡"
            title="设为激活（对话用）"
            onClick={onActivate}
          >
            <Check size={16} />
          </IconButton>
        )}
        <IconButton
          size="sm"
          label="编辑玩家卡"
          title="编辑"
          onClick={onEdit}
        >
          <PencilLine size={16} />
        </IconButton>
        <IconButton
          size="sm"
          variant="danger"
          label="删除玩家卡"
          title="删除"
          onClick={onDelete}
          disabled={persona._isLast}
        >
          <X size={16} />
        </IconButton>
      </div>
    </Card>
  );
}
