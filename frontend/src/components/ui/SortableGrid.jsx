import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
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
 * 拖动一张卡时，被覆盖位置的卡会平滑滑到原拖动卡的位置（rectSortingStrategy 提供）。
 *
 * Props:
 *   items              — 数组，每项必须有唯一 .id
 *   onReorder          — (newItems) => void，拖拽中实时更新（可省略）
 *   onReorderEnd       — (finalItems) => void，松手保存最终顺序
 *   renderItem         — (item, sortableProps) => ReactNode
 *                         sortableProps 形如 { setNodeRef, style, isDragging, attributes, listeners }
 *                         必须把 setNodeRef/style 套到卡根元素，attributes/listeners 套到拖拽响应元素
 *   className          — 容器 className（外部 grid 样式）
 *   activationDistance — 进入拖拽态的指针位移阈值（默认 8px，<阈值走原生 click）
 */
export default function SortableGrid({
  items,
  onReorder,
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

  function handleDragOver(event) {
    if (!onReorder) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
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
              isActive={activeId === item.id}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableGridItem({ item, renderItem, isActive }) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({
    id: item.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isActive || isDragging ? 10 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };
  return renderItem(item, { setNodeRef, style, isDragging, attributes, listeners });
}
