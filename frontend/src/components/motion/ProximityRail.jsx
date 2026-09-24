/* 移植自 Rare UI proximity-sidebar — https://rareui.com
 * Copyright (c) 2026 Swami Malode，许可见同目录 RAREUI_LICENSE。
 * 刻度导航：每项一根横线，指针靠近时按距离伸长；滚动时当前项短暂伸出一下再收回。
 * items 里的 id 对应滚动容器中 data-message-id 的元素。 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useMotion } from '../../core/hooks/useMotion.js';

const RADIUS = 40;
const MAX_WIDTH = 40;
const IDLE_RESET_DELAY = 80;
// 少于这么多项时刻度没有导航价值，不显示
const MIN_ITEMS = 3;
const DASH_SPRING = { stiffness: 320, damping: 34, mass: 0.7 };
// 助手回复比玩家发言长，刻度也更长
const PRESETS = {
  assistant: { base: 16, bump: 24 },
  user: { base: 10, bump: 18 },
};

const elementOf = (container, id) => container?.querySelector(`[data-message-id="${CSS.escape(String(id))}"]`);

function Dash({ item, active, mouseY, reduced, register, onSelect }) {
  const ref = useRef(null);
  const preset = PRESETS[item.kind] ?? PRESETS.user;

  useEffect(() => {
    register(item.id, ref.current);
    return () => register(item.id, null);
  }, [register, item.id]);

  const distance = useTransform(mouseY, (y) => {
    const rect = ref.current?.getBoundingClientRect();
    return rect ? y - (rect.top + rect.height / 2) : RADIUS;
  });
  const target = useTransform(
    distance,
    [-RADIUS, 0, RADIUS],
    [preset.base / MAX_WIDTH, (preset.base + preset.bump) / MAX_WIDTH, preset.base / MAX_WIDTH],
    { clamp: true },
  );
  const spring = useSpring(target, DASH_SPRING);

  return (
    <button
      ref={ref}
      type="button"
      aria-current={active ? 'location' : undefined}
      aria-label={`跳到：${item.label}`}
      title={item.label}
      className={`we-proximity-rail__dash we-proximity-rail__dash--${item.kind}`}
      onClick={() => onSelect(item.id)}
    >
      <motion.span style={{ scaleX: reduced ? target : spring, width: MAX_WIDTH }} />
    </button>
  );
}

export default function ProximityRail({ containerRef, items, onSelect }) {
  const { reduced } = useMotion();
  const mouseY = useMotionValue(Infinity);
  const dashRefs = useRef(new Map());
  const pointerInside = useRef(false);
  const resetTimer = useRef(null);
  const [activeId, setActiveId] = useState(items[0]?.id);
  const ids = items.map((item) => item.id).join('|');

  const register = useCallback((id, node) => {
    if (node) dashRefs.current.set(id, node);
    else dashRefs.current.delete(id);
  }, []);

  const clearReset = useCallback(() => {
    window.clearTimeout(resetTimer.current);
    resetTimer.current = null;
  }, []);

  // 不在刻度上时，把"指针"放到当前项上让它伸出一下，随后收回
  const pulse = useCallback((id) => {
    const node = dashRefs.current.get(id);
    if (node) {
      const rect = node.getBoundingClientRect();
      mouseY.set(rect.top + rect.height / 2);
    }
    clearReset();
    if (pointerInside.current) return;
    resetTimer.current = window.setTimeout(() => {
      mouseY.set(Infinity);
      resetTimer.current = null;
    }, IDLE_RESET_DELAY);
  }, [clearReset, mouseY]);

  useEffect(() => clearReset, [clearReset]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !ids) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const box = container.getBoundingClientRect();
      const anchor = box.top + box.height * 0.4;
      let next = null;
      let best = Infinity;
      for (const id of ids.split('|')) {
        const rect = elementOf(container, id)?.getBoundingClientRect();
        if (!rect) continue;
        const d = rect.top <= anchor && rect.bottom >= anchor
          ? 0
          : Math.min(Math.abs(rect.top - anchor), Math.abs(rect.bottom - anchor));
        if (d < best) {
          best = d;
          next = id;
        }
      }
      if (next === null) return;
      setActiveId(next);
      if (!pointerInside.current) pulse(next);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    container.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [containerRef, ids, pulse]);

  if (items.length < MIN_ITEMS) return null;

  return (
    <nav aria-label="本页消息" className="we-proximity-rail">
      <div
        className="we-proximity-rail__dashes"
        onPointerMove={(e) => {
          clearReset();
          pointerInside.current = true;
          mouseY.set(e.clientY);
        }}
        onPointerLeave={() => {
          pointerInside.current = false;
          mouseY.set(Infinity);
        }}
      >
        {items.map((item) => (
          <Dash
            key={item.id}
            item={item}
            active={String(item.id) === String(activeId)}
            mouseY={mouseY}
            reduced={reduced}
            register={register}
            onSelect={(id) => {
              setActiveId(id);
              onSelect(id);
            }}
          />
        ))}
      </div>
    </nav>
  );
}
