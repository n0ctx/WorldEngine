import AvatarCircle from '../../../components/ui/AvatarCircle.jsx';
import Card from '../../../components/ui/Card.jsx';
import { IconChatPlus, IconClose, IconPencil } from '../../../components/ui/icons.jsx';
import IconButton from '../../../components/ui/IconButton.jsx';
import { getAvatarUrl } from '../../../core/utils/avatar';
import { useDragAwareClick } from './useDragAwareClick.js';

// 卡内按钮自己处理点击和按键：不冒泡到卡片（进对话）和外层的拖动排序
const stopPropagation = (e) => e.stopPropagation();

// ── CharacterCard：竖版角色卡，上半是立绘（没有头像时是头像圆），下面名字和两行简介 ──

// 点卡片继续和这个角色最近的一段对话；「新对话」另开一条。
// setNodeRef / style / attributes / listeners 来自 SortableGrid，整张卡可拖动排序
export function CharacterCard({
  char, setNodeRef, style, isDragging, attributes, listeners, onCardClick, onNewChat, onEdit, onDelete,
}) {
  const clickProps = useDragAwareClick(onCardClick);
  const portrait = getAvatarUrl(char.avatar_path);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      aria-label={`拖动排序：${char.name}`}
      className="we-character-card-shell"
    >
      <Card
        interactive
        className="we-character-card"
        data-dragging={isDragging || undefined}
        role="button"
        aria-label={char.name}
        title="继续对话"
        tabIndex={0}
        onMouseDown={clickProps.onMouseDown}
        onClick={clickProps.onClick}
        onKeyDown={(e) => {
          clickProps.onKeyDown(e);
          if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
        }}
      >
        <div className="we-character-card-art">
          {portrait
            ? <img src={portrait} alt="" className="we-character-card-portrait" />
            : <AvatarCircle id={char.id} name={char.name} size="lg" />}
        </div>
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

        <div
          className="we-character-card-actions"
          onClick={stopPropagation}
          onPointerDown={stopPropagation}
          onKeyDown={stopPropagation}
        >
          <IconButton variant="overlay" size="sm" label="和这个角色开一段新对话" onClick={onNewChat}>
            <IconChatPlus size={16} />
          </IconButton>
          <IconButton variant="overlay" size="sm" label="编辑角色" onClick={onEdit}>
            <IconPencil size={16} />
          </IconButton>
          <IconButton variant="overlay" size="sm" className="is-danger" label="删除角色" onClick={onDelete}>
            <IconClose size={16} />
          </IconButton>
        </div>
      </Card>
    </div>
  );
}
