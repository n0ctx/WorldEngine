/* 移植自 Rare UI gooey-nav — https://rareui.com
 * Copyright (c) 2026 Swami Malode，许可见同目录 RAREUI_LICENSE。
 * 分段条：选中段与左右相邻段拉开缝隙、圆角打开。
 * 墨流包下缝隙里画一截收腰的"颈"：缝拉开时颈越来越细，拉到一定宽度断开，像液体被拉断。
 * 只负责分段外形与动效；每段里的按钮（角色、键盘、焦点）由调用方提供。 */
import { Children, useEffect, useId } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useMotion } from '../../core/hooks/useMotion.js';

const SEPARATION = 12;
const RADIUS = 10;
// 缝隙拉开到这个比例时颈已细到消失
const NECK_BREAK = 0.22;
// 名义 viewBox 高度；svg 拉伸到段的实际高度
const NECK_H = 100;

// 两条向中间收的凹曲线，画在两段之间的缝隙里
function neckPath(gap) {
  const span = SEPARATION;
  if (!Number.isFinite(gap) || gap <= 0) return '';
  const waist = NECK_H * (1 - gap / (span * NECK_BREAK));
  if (waist <= 0) return '';
  const start = span - gap;
  const mid = start + gap / 2;
  return `M${start} 0 Q${mid} ${NECK_H - waist} ${span} 0 L${span} ${NECK_H} Q${mid} ${waist} ${start} ${NECK_H} Z`;
}

function Neck({ gap, leftActive, rightActive }) {
  const gradientId = `we-gooey-neck-${useId().replace(/:/g, '')}`;
  const d = useTransform(gap, neckPath);
  return (
    <svg
      aria-hidden
      width={SEPARATION}
      viewBox={`0 0 ${SEPARATION} ${NECK_H}`}
      preserveAspectRatio="none"
      className="we-gooey-nav__neck"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1">
          <stop offset="0" className={leftActive ? 'we-gooey-nav__stop--active' : 'we-gooey-nav__stop'} />
          <stop offset="1" className={rightActive ? 'we-gooey-nav__stop--active' : 'we-gooey-nav__stop'} />
        </linearGradient>
      </defs>
      <motion.path d={d} fill={`url(#${gradientId})`} />
    </svg>
  );
}

function Segment({ gap, isActive, shape, neck, children }) {
  const m = useMotion();
  const { reduced, pack } = m;
  const marginLeft = useMotionValue(gap);
  const gapPx = useTransform(marginLeft, (g) => `${g}px`);

  useEffect(() => {
    if (reduced) {
      marginLeft.jump(gap);
      return undefined;
    }
    const move = animate(marginLeft, gap, pack.transitions.move);
    return () => move.stop();
  }, [gap, reduced, pack, marginLeft]);

  return (
    <motion.div
      role="presentation"
      className={`we-gooey-nav__segment${isActive ? ' is-active' : ''}`}
      style={{ '--we-gooey-gap': gapPx }}
      initial={false}
      animate={shape}
      transition={m.transition('move')}
    >
      {neck && <Neck gap={marginLeft} {...neck} />}
      {children}
    </motion.div>
  );
}

export default function GooeyNav({ active, children }) {
  const withNeck = useMotion().pack.traits.neck;
  const items = Children.toArray(children);
  const open = (seam) => seam === 0 || seam === items.length || seam - 1 === active || seam === active;

  return items.map((child, i) => (
    <Segment
      key={child.key ?? i}
      // 合上的缝往里收 1px，避免透出一条细线
      gap={i === 0 ? 0 : open(i) ? SEPARATION : -1}
      isActive={i === active}
      neck={withNeck && i > 0 ? { leftActive: i - 1 === active, rightActive: i === active } : null}
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
