/* 移植自 Rare UI task-list — https://rareui.com
 * Copyright (c) 2026 Swami Malode，许可见同目录 RAREUI_LICENSE。
 * 清单：一项完成时，虚线圈填满并画出对勾 → 标题被一笔划掉 → 整行轻轻一弹 → 沉到列表底部；
 * 回到未完成则按原路倒放。完成与否由调用方给出，每一行是一个普通按钮，点击交给调用方。 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useMotion } from '../../core/hooks/useMotion.js';

const EASE_OUT = [0.22, 1, 0.36, 1];
const EASE_IN_OUT = [0.65, 0, 0.35, 1];

const POP_SCALE = [1, 1.08, 1];
const FLICK = [0, 8, -2, 0];
const FLICK_TIMES = [0, 0.35, 0.7, 1];

const FILL = { duration: 0.24, ease: EASE_OUT };
const POP = { duration: 0.34, ease: EASE_OUT, times: [0, 0.4, 1] };
const TICK = { duration: 0.22, ease: EASE_OUT, delay: 0.06 };
const STRIKE = { duration: 0.38, ease: EASE_IN_OUT };
const NUDGE = { duration: 0.3, ease: EASE_OUT, times: FLICK_TIMES };
const REORDER = { type: 'spring', stiffness: 320, damping: 30 };
const INSTANT = { duration: 0 };

// 虚线段均分圆周，圈首尾不留接缝
const RING_R = 11;
const RING_DASH = `1 ${(2 * Math.PI * RING_R) / 13 - 1}`;

// 勾选走 tick → strike → nudge → settled，取消勾选沿原路倒走
const FILLED = ['tick', 'strike', 'nudge', 'settled', 'unstrike'];
const STRUCK = ['strike', 'nudge', 'settled'];

function useTiming() {
  const { reduced } = useMotion();
  return (transition) => (reduced ? INSTANT : transition);
}

function TaskCheck({ filled, onDrawn }) {
  const timing = useTiming();
  return (
    <motion.svg
      viewBox="0 0 24 24"
      aria-hidden
      className="we-task-check"
      initial={false}
      animate={{ scale: filled ? POP_SCALE : 1 }}
      transition={filled ? timing(POP) : INSTANT}
    >
      <motion.circle
        cx="12" cy="12" r={RING_R}
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={RING_DASH}
        initial={false}
        animate={{ opacity: filled ? 0 : 1 }}
        transition={timing(FILL)}
      />
      <motion.circle
        cx="12" cy="12" r="12"
        className="we-task-check__fill"
        style={{ transformBox: 'view-box', transformOrigin: '12px 12px' }}
        initial={false}
        animate={{ scale: filled ? 1 : 0 }}
        transition={timing(FILL)}
      />
      <motion.path
        d="M7.4 12.4 10.6 15.5 16.6 8.9"
        className="we-task-check__tick"
        fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        initial={false}
        animate={{ pathLength: filled ? 1 : 0, opacity: filled ? 1 : 0 }}
        transition={timing(TICK)}
        onAnimationComplete={onDrawn}
      />
    </motion.svg>
  );
}

function TaskItem({ task, className, onSettled, onReverted }) {
  const timing = useTiming();
  const [stage, setStage] = useState(task.done ? 'settled' : 'idle');
  const [was, setWas] = useState(task.done);

  // 与勾选状态同一次渲染里掉头，避免先画出一帧旧状态
  if (was !== task.done) {
    setWas(task.done);
    setStage(task.done ? 'tick' : 'unstrike');
  }

  const onDrawn = () => {
    if (stage === 'tick') setStage('strike');
    if (stage === 'untick') {
      setStage('idle');
      onReverted();
    }
  };
  const onStruck = () => {
    if (stage === 'strike') setStage('nudge');
    if (stage === 'unstrike') setStage('untick');
  };
  const onFlicked = () => {
    if (stage !== 'nudge') return;
    setStage('settled');
    onSettled();
  };

  const struck = STRUCK.includes(stage);
  return (
    <motion.button
      type="button"
      data-state={task.done ? 'checked' : 'unchecked'}
      className={className}
      onClick={task.onClick}
      animate={{ x: stage === 'nudge' ? FLICK : 0 }}
      transition={stage === 'nudge' ? timing(NUDGE) : INSTANT}
      onAnimationComplete={onFlicked}
    >
      <TaskCheck filled={FILLED.includes(stage)} onDrawn={onDrawn} />
      <span className="we-task-body">
        <motion.span
          className={`we-task-title${struck ? ' is-struck' : ''}`}
          initial={false}
          animate={{ backgroundSize: `${struck ? 100 : 0}% 2px` }}
          transition={timing(STRIKE)}
          onAnimationComplete={onStruck}
        >
          {task.title}
        </motion.span>
        {task.detail}
      </span>
      {task.trailing}
    </motion.button>
  );
}

// tasks: [{ id, title, done, detail?, trailing?, onClick }]
export default function TaskList({ tasks, className, itemClassName }) {
  const timing = useTiming();
  const [parked, setParked] = useState(() => tasks.filter((t) => t.done).map((t) => t.id));
  const [announcement, setAnnouncement] = useState('');

  // 已沉底但又变回未完成（或被移除）的行，回到未完成组
  const finished = parked
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t) => t?.done === true);
  const open = tasks.filter((t) => !finished.includes(t));

  return (
    <ul className={className}>
      {[...open, ...finished].map((task) => (
        <motion.li key={task.id} layout transition={timing(REORDER)}>
          <TaskItem
            task={task}
            className={itemClassName}
            onSettled={() => {
              setParked((ids) => (ids.includes(task.id) ? ids : [...ids, task.id]));
              setAnnouncement(`${task.title} 已完成`);
            }}
            onReverted={() => setParked((ids) => ids.filter((id) => id !== task.id))}
          />
        </motion.li>
      ))}
      <li role="status" aria-live="polite" className="sr-only">{announcement}</li>
    </ul>
  );
}
