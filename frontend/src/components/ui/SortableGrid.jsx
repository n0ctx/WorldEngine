import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  MeasuringStrategy,
  useSensor,
  useSensors,
  closestCenter,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * SortableGrid — 2D 网格内可拖拽重排的容器
 *
 * 使用 DragOverlay 渲染拖动副本：被拖动的卡片本体保留在原位作为占位（隐藏但仍占格），
 * 实际跟手的副本 fixed 定位、不进入文档流，因此可自由拖出页面而不会撑开滚动。
 *
 * 让位方式：拖动过程中直接把顺序改在真实列表里（onDragOver 即时 arrayMove），
 * 由浏览器的 grid 布局算出每张卡的真实位置，再靠 useSortable 的 FLIP 动画补上过渡。
 * 不用 rectSortingStrategy 那种"按等大矩形推算位移"的策略——网格里混着跨行跨列的
 * 大格时它算出来的位置是错的，得先把网格拍平成等大格才能用，而拍平本身就是一次
 * 整网格重排，一按下去所有卡就漂移一次。真实布局没有这个前提，大格保持大格，
 * 占位始终正确。
 *
 * Props:
 *   items              — 数组，每项必须有唯一 .id
 *   onReorderEnd       — (finalItems) => void，松手保存最终顺序
 *   renderItem         — (item, sortableProps) => ReactNode
 *                         sortableProps 形如 { setNodeRef, style, isDragging, index, attributes, listeners }
 *                         必须把 setNodeRef/style 套到卡根元素，attributes/listeners 套到拖拽响应元素
 *                         index 是该卡在拖动中列表里的实时位置，用于按位次决定样式（如首位大格）
 *   className          — 容器 className（外部 grid 样式）
 *   activationDistance — 进入拖拽态的指针位移阈值（默认 8px，<阈值走原生 click）
 */
const dropAnimation = {
  duration: 220,
  easing: 'cubic-bezier(0.18, 0.67, 0.32, 1.0)',
  // 用 visibility 而非 opacity 隐藏原位卡片：
  // 入场 we-ink-rise 关键帧 fill-mode:both 把 opacity 永久钉在 1，inline opacity:0 无效；
  // visibility 不在关键帧里，inline 设置生效，且不影响布局占位。
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: { visibility: 'hidden' },
    },
  }),
};

// 让位靠真实布局变化驱动，所以每次 rect 变化都要放 FLIP 动画，
// 不能用默认的 defaultAnimateLayoutChanges（排序期间返回 false，会变成硬跳）。
const alwaysAnimateLayoutChanges = () => true;

// 拖动中列表顺序会实时变化，droppable 的 rect 必须跟着重新测量，
// 否则碰撞检测还在拿旧位置比对。
const measuring = { droppable: { strategy: MeasuringStrategy.Always } };

export default function SortableGrid({
  items,
  onReorderEnd,
  renderItem,
  className,
  activationDistance = 8,
}) {
  const [activeId, setActiveId] = useState(null);
  const [draftItems, setDraftItems] = useState(null);
  const [isDropping, setIsDropping] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: activationDistance } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const displayItems = draftItems ?? items;

  function handleDragStart(event) {
    setActiveId(event.active.id);
    setDraftItems(items);
  }

  function handleDragOver(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraftItems((current) => {
      const list = current ?? items;
      const oldIndex = list.findIndex((i) => i.id === active.id);
      const newIndex = list.findIndex((i) => i.id === over.id);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return list;
      return arrayMove(list, oldIndex, newIndex);
    });
  }

  function handleDragEnd() {
    const finalItems = draftItems ?? items;
    setActiveId(null);
    setDraftItems(null);
    setIsDropping(true);
    setTimeout(() => setIsDropping(false), 300);
    const changed = finalItems.some((item, i) => item.id !== items[i]?.id);
    if (changed) onReorderEnd?.(finalItems);
  }

  function handleDragCancel() {
    setActiveId(null);
    setDraftItems(null);
  }

  const activeIndex = activeId ? displayItems.findIndex((i) => i.id === activeId) : -1;
  const activeItem = activeIndex >= 0 ? displayItems[activeIndex] : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={measuring}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={displayItems.map((i) => i.id)}>
        <div className={className} data-dropping={isDropping || undefined}>
          {displayItems.map((item, index) => (
            <SortableGridItem
              key={item.id}
              item={item}
              index={index}
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
              index: activeIndex,
              attributes: {},
              listeners: {},
            })
          : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableGridItem({ item, index, renderItem }) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({
    id: item.id,
    animateLayoutChanges: alwaysAnimateLayoutChanges,
  });
  const style = {
    // 只取平移不取 scale：大格与小格互换时 scale 会把卡里的封面和标题压扁。
    transform: CSS.Translate.toString(transform),
    transition,
    visibility: isDragging ? 'hidden' : 'visible',
    cursor: isDragging ? 'grabbing' : 'grab',
    touchAction: 'none',
  };
  return renderItem(item, { setNodeRef, style, isDragging, index, attributes, listeners });
}
