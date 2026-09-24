/* 移植自 Rare UI animated-counter — https://rareui.com
 * Copyright (c) 2026 Swami Malode，许可见同目录 RAREUI_LICENSE。
 * 里程表式数字：每一位是一只 0–9 的轮子，数值变化时按方向滚到新的面。 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
} from 'framer-motion';
import { useMotion } from '../../core/hooks/useMotion.js';

const FACES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
// 末尾补一个 0，9 → 0 回绕时落在同样的面上
const WHEEL = [...FACES, 0];

const EASE = [0.22, 1, 0.36, 1];
const BOUNCE = 0.18;
const LEAVE = { duration: 0.18, ease: EASE };
const INSTANT = { duration: 0 };

const spring = (duration) => ({ type: 'spring', visualDuration: duration, bounce: BOUNCE });

const mod = (n, m) => ((n % m) + m) % m;

const SIZER = FACES.map((face) => (
  <span key={face} aria-hidden className="we-counter__sizer">{face}</span>
));

const STACK = WHEEL.map((face, index) => (
  <span key={index} className="we-counter__face">{face}</span>
));

// 按离个位的距离编号，多出一位时是整列平移而不是重新挂载
const toCells = (chars) => [...chars].map((char, i) => ({ key: chars.length - 1 - i, digit: Number(char) }));

function useWheel(from, digit, dir, duration, reduced) {
  const pos = useMotionValue(from);
  const goal = useRef(from);

  // 只读取方向，不作为依赖：单纯反向不应让每一列都重新起转
  const heading = useRef(dir);
  useEffect(() => {
    heading.current = dir;
  }, [dir]);

  useEffect(() => {
    if (reduced) {
      goal.current = digit;
      pos.set(digit);
      return undefined;
    }
    if (mod(goal.current, 10) !== digit) {
      // 从轮子当前位置起算，连续变化时不会积压多圈
      const at = pos.get();
      goal.current = heading.current < 0 ? at - mod(at - digit, 10) : at + mod(digit - at, 10);
    }
    const roll = animate(pos, goal.current, spring(duration));
    return () => roll.stop();
  }, [digit, duration, reduced, pos]);

  return useTransform(pos, (p) => `${(-mod(p, 10) * 100) / WHEEL.length}%`);
}

const shifts = ({ reduced, dep, shift }) => ({
  layout: !reduced,
  layoutDependency: dep,
  transition: shift,
});

const fades = (reduced) => ({
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0, transition: reduced ? INSTANT : LEAVE },
});

const Digit = memo(function Digit({ digit, from, dir, duration, ref, ...slot }) {
  const y = useWheel(from, digit, dir, duration, slot.reduced);
  return (
    <motion.span
      ref={ref}
      {...shifts(slot)}
      {...fades(slot.reduced)}
      className="we-counter__digit"
    >
      {SIZER}
      <motion.span style={{ y }} className="we-counter__stack">{STACK}</motion.span>
    </motion.span>
  );
});

export default function AnimatedCounter({ value, duration = 0.6, className = '' }) {
  const { reduced } = useMotion();
  const amount = Number.isFinite(value) ? Math.trunc(value) : 0;
  const chars = String(Math.abs(amount));
  const cells = toCells(chars);

  const [previous, setPrevious] = useState(amount);
  const [dir, setDir] = useState(1);
  if (previous !== amount) {
    setDir(amount >= previous ? 1 : -1);
    setPrevious(amount);
  }

  // 挂载时的面；之后新增的位从 0 滚入
  const [seed] = useState(() => Object.fromEntries(cells.map((c) => [c.key, c.digit])));

  const shift = useMemo(() => (reduced ? INSTANT : spring(duration)), [reduced, duration]);
  const slot = { reduced, dep: chars.length, shift };

  return (
    <span className={`we-counter${className ? ` ${className}` : ''}`}>
      <span className="we-visually-hidden">{amount}</span>
      <span aria-hidden className="we-counter__wheels">
        {amount < 0 && <motion.span {...shifts(slot)} className="we-counter__mark">-</motion.span>}
        <AnimatePresence mode="popLayout" initial={false}>
          {cells.map((cell) => (
            <Digit
              key={cell.key}
              {...slot}
              digit={cell.digit}
              from={seed[cell.key] ?? 0}
              dir={dir}
              duration={duration}
            />
          ))}
        </AnimatePresence>
      </span>
    </span>
  );
}
