import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * SortableGrid — 2D 网格内可拖拽重排的容器
 *
 * 使用 DragOverlay 渲染拖动副本：被拖动的卡片本体保留在原位作为占位（半透明），
 * 实际跟手的副本 fixed 定位、不进入文档流，因此可自由拖出页面而不会撑开滚动。
 *
 * 其它卡片通过 rectSortingStrategy 在指针进入对应槽位时平滑让位；
 * 松手时一次性提交最终顺序，避免拖动中索引漂移导致跳跃。
 *
 * Props:
 *   items              — 数组，每项必须有唯一 .id
 *   onReorderEnd       — (finalItems) => void，松手保存最终顺序
 *   renderItem         — (item, sortableProps) => ReactNode
 *                         sortableProps 形如 { setNodeRef, style, isDragging, attributes, listeners }
 *                         必须把 setNodeRef/style 套到卡根元素，attributes/listeners 套到拖拽响应元素
 *   className          — 容器 className（外部 grid 样式）
 *   activationDistance — 进入拖拽态的指针位移阈值（默认 8px，<阈值走原生 click）
 */
const dropAnimation = {
  duration: 220,
  easing: 'cubic-bezier(0.18, 0.67, 0.32, 1.0)',
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: { opacity: '0' },
    },
  }),
};

export default function SortableGrid({
  items,
  onReorderEnd,
  renderItem,
  className,
  activationDistance = 8,
}) {
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: activationDistance } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(event) {
    setActiveId(event.active.id);
  }

  function handleDragEnd(event) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const finalItems = oldIndex === newIndex ? items : arrayMove(items, oldIndex, newIndex);
    onReorderEnd?.(finalItems);
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  const activeItem = activeId ? items.find((i) => i.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
        <div className={className}>
          {items.map((item) => (
            <SortableGridItem
              key={item.id}
              item={item}
              renderItem={renderItem}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={dropAnimation}>
        {activeItem
          ? renderItem(activeItem, {
              setNodeRef: () => {},
              style: { cursor: 'grabbing', boxShadow: '0 16px 32px rgba(0,0,0,0.18)' },
              isDragging: true,
              attributes: {},
              listeners: {},
            })
          : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableGridItem({ item, renderItem }) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({
    id: item.id,
    animateLayoutChanges: () => false,
  });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    touchAction: 'none',
  };
  return renderItem(item, { setNodeRef, style, isDragging, attributes, listeners });
}
