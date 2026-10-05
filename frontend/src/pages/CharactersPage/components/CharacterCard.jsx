import CharacterSeal from '../../../components/chat/CharacterSeal.jsx';
import Card from '../../../components/ui/Card.jsx';
import DragHandle from '../../../components/ui/DragHandle.jsx';
import { MessageSquarePlus, PencilLine, X } from 'lucide-react';
import IconButton from '../../../components/ui/IconButton.jsx';
import { useDragAwareClick } from './useDragAwareClick.js';

// ── CharacterCard（内联组件，紧凑变体）──────────────────────────────────────

// 点卡片继续和这个角色最近的一段对话；「新对话」另开一条
export function CharacterCard({ char, dragHandleProps, onCardClick, onNewChat, onEdit, onDelete }) {
  const clickProps = useDragAwareClick(onCardClick);

  return (
    <Card
      density="compact"
      interactive
      className="we-character-card we-character-card--compact"
      role="button"
      title="继续对话"
      tabIndex={0}
      onMouseDown={clickProps.onMouseDown}
      onClick={clickProps.onClick}
      onKeyDown={clickProps.onKeyDown}
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
        <IconButton
          size="sm"
          label="和这个角色开一段新对话"
          onClick={onNewChat}
        >
          <MessageSquarePlus size={16} />
        </IconButton>
        <IconButton
          size="sm"
          label="编辑角色"
          title="编辑"
          onClick={onEdit}
        >
          <PencilLine size={16} />
        </IconButton>
        <IconButton
          size="sm"
          variant="danger"
          label="删除角色"
          title="删除"
          onClick={onDelete}
        >
          <X size={16} />
        </IconButton>
      </div>
    </Card>
  );
}
