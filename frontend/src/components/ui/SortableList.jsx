import { useEffect, useRef } from 'react';
import { Reorder, useDragControls } from 'framer-motion';

/**
 * SortableList — 带平滑滑动动画的可排序列表
 * Props:
 *   items         — 数组，每项必须有唯一 .id
 *   onReorder     — (newItems) => void，拖动过程中实时更新 state
 *   onReorderEnd  — (finalItems) => void，松手后保存顺序
 *   renderItem    — (item, dragHandleProps?) => ReactNode
 *                   useHandle=true 时 dragHandleProps 包含 onPointerDown，展开到拖拽句柄元素上
 *   className     — Reorder.Group 容器 className
 *   useHandle     — false（默认）整行可拖；true 仅句柄可拖（renderItem 必须将 dragHandleProps 展开到句柄元素）
 */
export default function SortableList({
  items, onReorder, onReorderEnd, renderItem, className, style, useHandle = false,
}) {
  const latestRef = useRef(items);

  useEffect(() => {
    latestRef.current = items;
  }, [items]);

  function handleReorder(newItems) {
    latestRef.current = newItems;
    onReorder(newItems);
  }

  function handleDragEnd() {
    onReorderEnd?.(latestRef.current);
  }

  return (
    <Reorder.Group
      as="div"
      axis="y"
      values={items}
      onReorder={handleReorder}
      className={className}
      style={style}
    >
      {items.map((item) => (
        <SortableItem
          key={item.id}
          item={item}
          onDragEnd={handleDragEnd}
          renderItem={renderItem}
          useHandle={useHandle}
        />
      ))}
    </Reorder.Group>
  );
}

function SortableItem({ item, onDragEnd, renderItem, useHandle }) {
  const controls = useDragControls();

  const dragHandleProps = useHandle
    ? { onPointerDown: (e) => { e.preventDefault(); controls.start(e); } }
    : undefined;

  return (
    <Reorder.Item
      as="div"
      value={item}
      onDragEnd={onDragEnd}
      dragListener={!useHandle}
      dragControls={useHandle ? controls : undefined}
      whileDrag={{ boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 10, position: 'relative' }}
    >
      {renderItem(item, dragHandleProps)}
    </Reorder.Item>
  );
}
