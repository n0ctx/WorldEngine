/* 移植自 Rare UI bounce-sidebar — https://rareui.com
 * Copyright (c) 2026 Swami Malode，许可见同目录 RAREUI_LICENSE。
 * 竖向导航左侧的指示圆点：当前项变化时，圆点沿一段向左鼓出的弧线弹到新项旁边；
 * 墨流包下不走弧线，圆点沿竖线拉成一截墨：朝目标那一端先冲过去、另一端被拖着跟上，到位后收回成圆点。
 * 只画圆点，不接管导航本身：容器里带 data-bounce-item 的元素是导航项，aria-current 标记当前项。
 * 弧线跳到位后在落点放一个锁定锚点（we-bounce-rail__lock），由动效包的样式决定是否画准星。 */
import { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useMotion } from '../../core/hooks/useMotion.js';

const DOT = 6;
// 圆点与导航项左缘的距离
const GAP = 8;
// 圆点沿弧线滑到新项。分格跳会在导航项之间一顿一顿，看起来像卡住
const HOP_DURATION = 0.25;

const itemsOf = (container) => [...container.querySelectorAll('[data-bounce-item]')];

function targetOf(container) {
  const el = itemsOf(container).find((item) => item.hasAttribute('aria-current'));
  if (!el) return null;
  return { x: el.offsetLeft - GAP - DOT, y: el.offsetTop + el.offsetHeight / 2 - DOT / 2 };
}

// 二次贝塞尔弧线：控制点在中点的垂线上，鼓出高度 = 距离 × strength（移植自 motion 的 arc()）
function arcPoint(from, to, t) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const strength = Math.min(0.8, 14 / distance);
  // 上游向下走取 ccw、向上走取 cw，两者都鼓向左侧
  const signed = dy > 0 ? strength : -strength;
  const cx = from.x + dx / 2 - dy * signed;
  const cy = from.y + dy / 2 + dx * signed;
  const inv = 1 - t;
  return {
    x: inv * inv * from.x + 2 * inv * t * cx + t * t * to.x,
    y: inv * inv * from.y + 2 * inv * t * cy + t * t * to.y,
  };
}

export default function BounceRail({ containerRef, activeKey }) {
  const { reduced, pack } = useMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  // 墨流拉伸时的下端；平时与 y 相同
  const end = useMotionValue(0);
  const length = useTransform(() => `${end.get() - y.get() + DOT}px`);
  const placed = useRef(null);
  const [visible, setVisible] = useState(false);
  // 最近一次落点：每落一次换一个 key，锚点重新挂载，准星动画重播
  const [lock, setLock] = useState(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const to = targetOf(container);
    setVisible(!!to);
    if (!to) return undefined;
    const from = placed.current;
    placed.current = to;
    if (reduced || !from || (from.x === to.x && from.y === to.y)) {
      x.set(to.x);
      y.set(to.y);
      end.set(to.y);
      return undefined;
    }
    if (pack.traits.rail === 'stretch') {
      x.set(to.x);
      const down = to.y > y.get();
      const { move, moveTrail } = pack.transitions;
      const top = animate(y, to.y, down ? moveTrail : move);
      const bottom = animate(end, to.y, down ? move : moveTrail);
      return () => { top.stop(); bottom.stop(); };
    }
    const hop = animate(0, 1, {
      ...pack.flow(HOP_DURATION),
      onUpdate: (t) => {
        const p = arcPoint(from, to, t);
        x.set(p.x);
        y.set(p.y);
        end.set(p.y);
      },
      onComplete: () => setLock((prev) => ({ x: to.x + DOT / 2, y: to.y + DOT / 2, key: (prev?.key ?? 0) + 1 })),
    });
    return () => hop.stop();
  }, [containerRef, activeKey, reduced, pack, x, y, end]);

  // 布局变化（窗口缩放、列表增减）时直接落到新位置，不走弧线
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      const to = targetOf(container);
      if (!to) return;
      placed.current = to;
      x.set(to.x);
      y.set(to.y);
      end.set(to.y);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, x, y, end]);

  return (
    <>
      <motion.span
        aria-hidden
        className={`we-bounce-rail${visible ? ' is-visible' : ''}`}
        style={{ x, y, '--we-bounce-rail-length': length }}
      />
      {lock && (
        <span
          key={lock.key}
          aria-hidden
          className="we-bounce-rail__lock"
          style={{ translate: `${lock.x}px ${lock.y}px` }}
        />
      )}
    </>
  );
}
