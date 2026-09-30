import { useEffect, useRef, useState } from 'react';
import { Reorder, motion, useDragControls, useMotionValue, useTransform } from 'framer-motion';
import { useMotion } from '../../core/hooks/useMotion.js';
import { MOTION } from '../../core/utils/motion.js';

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
 *
 * 拿起、放下的样子归动效包（themes/motion/*.css 的「拖拽排序」小节）：条目上的 data-sort 为 drag（拿在手里）
 * 或 drop（刚放下，名字以 we-sort-settle 开头的动画播完后清掉）；__slot 是停在条目当前落点上的占位框。
 * 其余条目让位走 useMotion().flow。
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
  const m = useMotion();
  const controls = useDragControls();
  const [state, setState] = useState();
  const y = useMotionValue(0);
  // 占位框抵消拖动位移，停在这一项此刻占着的位置上
  const slotY = useTransform(y, (v) => -v);

  const dragHandleProps = useHandle
    ? { onPointerDown: (e) => { e.preventDefault(); controls.start(e); } }
    : undefined;

  return (
    <Reorder.Item
      as="div"
      value={item}
      className="we-sortable-item"
      data-sort={state}
      style={{ y }}
      transition={m.flow(MOTION.enter.duration)}
      onDragStart={() => setState('drag')}
      onDragEnd={(...args) => {
        setState('drop');
        onDragEnd(...args);
      }}
      onAnimationEnd={(e) => {
        if (e.animationName.startsWith('we-sort-settle')) setState(undefined);
      }}
      dragListener={!useHandle}
      dragControls={useHandle ? controls : undefined}
      whileDrag={{ zIndex: 'var(--we-z-action)' }}
    >
      {renderItem(item, dragHandleProps)}
      <motion.span className="we-sortable-item__slot" style={{ y: slotY }} aria-hidden="true" />
    </Reorder.Item>
  );
}
