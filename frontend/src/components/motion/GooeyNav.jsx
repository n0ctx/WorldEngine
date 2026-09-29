/* 移植自 Rare UI gooey-nav — https://rareui.com
 * Copyright (c) 2026 Swami Malode，许可见同目录 RAREUI_LICENSE。
 * 分段条：选中段与左右相邻段拉开缝隙、圆角打开，缝隙分格跳开，选中色硬切。
 * 只负责分段外形与动效；每段里的按钮（角色、键盘、焦点）由调用方提供。 */
import { Children } from 'react';
import { motion } from 'framer-motion';
import { useMotion } from '../../core/hooks/useMotion.js';

const SEPARATION = 12;
const RADIUS = 10;

function Segment({ gap, isActive, shape, transition, children }) {
  return (
    <motion.div
      role="presentation"
      className={`we-gooey-nav__segment${isActive ? ' is-active' : ''}`}
      initial={false}
      animate={{ marginLeft: gap, ...shape }}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}

export default function GooeyNav({ active, children }) {
  const m = useMotion();
  // 缝隙与圆角平滑打开。分格跳会让分段条在切换时顿住
  const transition = m.transition('move');
  const items = Children.toArray(children);
  const open = (seam) => seam === 0 || seam === items.length || seam - 1 === active || seam === active;

  return items.map((child, i) => (
    <Segment
      key={child.key ?? i}
      // 合上的缝往里收 1px，避免透出一条细线
      gap={i === 0 ? 0 : open(i) ? SEPARATION : -1}
      isActive={i === active}
      transition={transition}
      shape={{
        borderTopLeftRadius: open(i) ? RADIUS : 0,
        borderBottomLeftRadius: open(i) ? RADIUS : 0,
        borderTopRightRadius: open(i + 1) ? RADIUS : 0,
        borderBottomRightRadius: open(i + 1) ? RADIUS : 0,
      }}
    >
      {child}
    </Segment>
  ));
}
