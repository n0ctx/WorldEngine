/* 移植自 Rare UI folder-component — https://rareui.com
 * Copyright (c) 2026 Swami Malode，许可见同目录 RAREUI_LICENSE。
 * 文件夹：三张卡片插在里面，悬停时卡片向上错开、前盖往后仰；打开时卡片扇形飞出。
 * 只负责画，状态由外层卡片按悬停 / 按下传入，颜色读 --we-* token。 */
import { motion } from 'framer-motion';
import { useMotion } from '../../core/hooks/useMotion.js';

const BASE_WIDTH = 321;
const BASE_HEIGHT = 270;
const FLAP_PATH =
  'M0 25C0 11.1929 11.1929 0 25 0H136.084C143.044 0 149.689 2.90139 154.42 8.00608L178.08 33.5343C182.811 38.639 189.456 41.5404 196.416 41.5404H296C309.807 41.5404 321 52.7333 321 66.5404V216C321 229.807 309.807 241 296 241H25C11.1929 241 0 229.807 0 216V25Z';
const INSTANT = { duration: 0 };

// 三张卡在静止 / 悬停 / 打开时的位置与错峰延迟，数值取自上游
const CARDS = [
  { rest: { x: 40, y: -10, rotate: 10 }, hover: { x: 40, y: -30, rotate: 14 }, open: { x: 70, y: -160, rotate: 18 }, delay: { hover: 0.12, open: 0.1 } },
  { rest: { x: 3, y: -20, rotate: 2 }, hover: { x: 3, y: -35, rotate: -1 }, open: { x: 0, y: -180, rotate: -3 }, delay: { hover: 0.06, open: 0.05 } },
  { rest: { x: -40, y: -22, rotate: -5 }, hover: { x: -40, y: -44, rotate: -9 }, open: { x: -65, y: -170, rotate: -14 }, delay: { hover: 0, open: 0 } },
];
const FLAP_TILT = { rest: -15, hover: -45, open: -55 };

// 卡面：标题条 + 两列八行的文字条
const LINE_ROWS = Array.from({ length: 8 }, (_, i) => 61 + i * 14.118);

function Card() {
  return (
    <svg width="164" height="214" viewBox="0 0 164 214" fill="none" aria-hidden>
      <rect x="0.5" y="0.5" width="162.078" height="212.262" rx="19.5" className="we-folder__card" />
      <rect x="14.12" y="31.21" width="134.84" height="11.89" rx="5.94" className="we-folder__card-line" />
      {LINE_ROWS.map((y) => (
        <g key={y} className="we-folder__card-line">
          <rect x="14.83" y={y} width="64.52" height="5.88" rx="2.94" />
          <rect x="84.43" y={y} width="64.52" height="5.88" rx="2.94" />
        </g>
      ))}
    </svg>
  );
}

// state: 'rest' | 'hover' | 'open'；width 为渲染宽度（px），高度按原比例
export default function Folder({ state = 'rest', width = 56 }) {
  const { reduced } = useMotion();
  const scale = width / BASE_WIDTH;
  return (
    <span
      aria-hidden
      className="we-folder"
      style={{ width, height: BASE_HEIGHT * scale }}
    >
      <span
        className="we-folder__stage"
        style={{
          width: BASE_WIDTH,
          height: BASE_HEIGHT,
          transform: `translate(-50%, -50%) scale(${scale})`,
          perspective: 800,
        }}
      >
        <span className="we-folder__back" />
        <span className="we-folder__cards">
          {CARDS.map((card, i) => (
            <motion.span
              key={i}
              className="we-folder__card-slot"
              initial={false}
              animate={card[state]}
              transition={reduced ? INSTANT : { type: 'spring', stiffness: 120, damping: 13, delay: card.delay[state] ?? 0 }}
            >
              <Card />
            </motion.span>
          ))}
        </span>
        <motion.span
          className="we-folder__flap"
          initial={false}
          animate={{ rotateX: FLAP_TILT[state] }}
          transition={reduced ? INSTANT : { type: 'spring', stiffness: 120, damping: 14 }}
        >
          <span className="we-folder__flap-glass" style={{ clipPath: `path('${FLAP_PATH}')` }} />
          <svg width="321" height="241" viewBox="0 0 321 241" fill="none" className="we-folder__flap-shape">
            <path d={FLAP_PATH} className="we-folder__flap-fill" />
            <path
              d="M25 0.5H136.084C142.905 0.5 149.417 3.3431 154.054 8.3457L177.713 33.874C182.539 39.0808 189.317 42.04 196.416 42.04H296C309.531 42.04 320.5 53.0092 320.5 66.54V216C320.5 229.531 309.531 240.5 296 240.5H25C11.469 240.5 0.5 229.531 0.5 216V25C0.5 11.469 11.469 0.5 25 0.5Z"
              className="we-folder__flap-stroke"
            />
          </svg>
        </motion.span>
      </span>
    </span>
  );
}
