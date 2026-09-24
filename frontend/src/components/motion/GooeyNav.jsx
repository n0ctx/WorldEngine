/* 移植自 Rare UI gooey-nav — https://rareui.com
 * Copyright (c) 2026 Swami Malode，许可见同目录 RAREUI_LICENSE。
 * 分段条：选中段像液滴一样从整条里分离出来，两侧缝隙由一截收腰的"颈"连着，拉开后颈断开。
 * 只负责分段外形与动效；每段里的按钮（角色、键盘、焦点）由调用方提供。 */
import { Children, useEffect, useId } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { useMotion } from '../../core/hooks/useMotion.js';

// 取自 duration picker 的弹簧，加大阻尼避免过冲
const SPRING = { type: 'spring', stiffness: 200, damping: 28, mass: 1 };
// 缝隙拉开到这个比例时颈已细到消失
const NECK_BREAK = 0.22;
// 名义 viewBox 高度；svg 拉伸到段的实际高度
const NECK_H = 100;
const SEPARATION = 12;
const RADIUS = 10;

// 两条向中间收的凹曲线，画在两段之间的缝隙里
function neckPath(gap, span) {
  if (!Number.isFinite(gap) || !Number.isFinite(span) || gap <= 0 || span <= 0) return '';
  const waist = NECK_H * (1 - gap / (span * NECK_BREAK));
  if (waist <= 0) return '';
  const start = span - gap;
  const mid = start + gap / 2;
  return `M${start} 0 Q${mid} ${NECK_H - waist} ${span} 0 L${span} ${NECK_H} Q${mid} ${waist} ${start} ${NECK_H} Z`;
}

function Segment({ gap, span, hasSeam, leftActive, rightActive, isActive, reduced, radii, children }) {
  const marginLeft = useSpring(gap, SPRING);
  const gradientId = `we-gooey-neck-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    if (reduced) marginLeft.jump(gap);
    else marginLeft.set(gap);
  }, [gap, marginLeft, reduced]);

  const d = useTransform(marginLeft, (g) => neckPath(g, span));
  const gapPx = useTransform(marginLeft, (g) => `${g}px`);

  return (
    <motion.div
      role="presentation"
      className={`we-gooey-nav__segment${isActive ? ' is-active' : ''}`}
      style={{ '--we-gooey-gap': gapPx }}
      initial={false}
      animate={radii}
      transition={reduced ? { duration: 0 } : SPRING}
    >
      {hasSeam && (
        <svg
          aria-hidden
          width={span}
          viewBox={`0 0 ${span} ${NECK_H}`}
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
      )}
      {children}
    </motion.div>
  );
}

export default function GooeyNav({ active, children }) {
  const { reduced } = useMotion();
  const items = Children.toArray(children);
  const open = (seam) => seam === 0 || seam === items.length || seam - 1 === active || seam === active;

  return items.map((child, i) => (
    <Segment
      key={child.key ?? i}
      // 合上的缝往里收 1px，避免透出一条细线
      gap={i === 0 ? 0 : open(i) ? SEPARATION : -1}
      span={SEPARATION}
      hasSeam={i > 0}
      leftActive={i - 1 === active}
      rightActive={i === active}
      isActive={i === active}
      reduced={reduced}
      radii={{
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
