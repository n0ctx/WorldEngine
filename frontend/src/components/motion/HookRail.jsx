/* 移植自 Rare UI hook-sidebar — https://rareui.com
 * Copyright (c) 2026 Swami Malode，许可见同目录 RAREUI_LICENSE。
 * 竖向导航左侧的虚线导轨：从顶部垂到当前项，末端弯成一个钩指向它；悬停 / 聚焦别的项时另画一条浅色预览线。
 * 只画导轨，不接管导航本身：容器里带 data-hook-item 的元素是导航项，aria-current 标记当前项。 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useMotion } from '../../core/hooks/useMotion.js';

const CORNER = 6;
const TRAVEL = { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 };
const FADE = { duration: 0.2 };
const INSTANT = { duration: 0 };

function Rail({ from = 0, y, visible, tone, reduced }) {
  const travel = reduced ? INSTANT : TRAVEL;
  return (
    <motion.span
      aria-hidden
      initial={false}
      animate={{ opacity: visible && y !== null ? 1 : 0 }}
      transition={reduced ? INSTANT : FADE}
      className={`we-hook-rail we-hook-rail--${tone}`}
    >
      <motion.span
        initial={false}
        animate={{ top: from, height: Math.max(0, (y ?? 0) - CORNER - from) }}
        transition={travel}
        className="we-hook-rail__line"
      />
      <motion.svg
        initial={false}
        animate={{ top: (y ?? 0) - CORNER }}
        transition={travel}
        width="12"
        height="7"
        viewBox="0 0 12 7"
        fill="none"
        className="we-hook-rail__hook"
      >
        <path d="M0.5 0a6 6 0 0 0 6 6H12" stroke="currentColor" strokeDasharray="2 2" />
      </motion.svg>
    </motion.span>
  );
}

const itemsOf = (container) => [...container.querySelectorAll('[data-hook-item]')];

export default function HookRail({ containerRef, activeKey }) {
  const { reduced } = useMotion();
  const [centers, setCenters] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hoverIndex, setHoverIndex] = useState(null);
  const [engaged, setEngaged] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const measure = () => {
      const items = itemsOf(container);
      setCenters(items.map((el) => el.offsetTop + el.offsetHeight / 2));
      setActiveIndex(items.findIndex((el) => el.hasAttribute('aria-current')));
    };
    measure();
    const indexOf = (target) => itemsOf(container).indexOf(target.closest?.('[data-hook-item]'));
    const onOver = (e) => {
      const i = indexOf(e.target);
      if (i < 0) return;
      setHoverIndex(i);
      setEngaged(true);
    };
    const onLeave = () => setEngaged(false);
    const onFocusOut = (e) => {
      if (!container.contains(e.relatedTarget)) setEngaged(false);
    };
    container.addEventListener('pointerover', onOver);
    container.addEventListener('focusin', onOver);
    container.addEventListener('pointerleave', onLeave);
    container.addEventListener('focusout', onFocusOut);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(container);
    return () => {
      container.removeEventListener('pointerover', onOver);
      container.removeEventListener('focusin', onOver);
      container.removeEventListener('pointerleave', onLeave);
      container.removeEventListener('focusout', onFocusOut);
      observer?.disconnect();
    };
  }, [containerRef, activeKey]);

  const activeY = activeIndex < 0 ? null : (centers[activeIndex] ?? null);
  const hoverY = hoverIndex === null ? null : (centers[hoverIndex] ?? null);
  // 悬停项在当前项上方时，主导轨已覆盖这一段，预览线只画钩
  const hoverFrom = activeY !== null && hoverY !== null && hoverY <= activeY
    ? Math.max(0, hoverY - CORNER)
    : (activeY ?? 0);

  return (
    <>
      <Rail from={hoverFrom} y={hoverY} visible={engaged && hoverIndex !== activeIndex} tone="preview" reduced={reduced} />
      <Rail y={activeY} visible={activeY !== null} tone="active" reduced={reduced} />
    </>
  );
}
