import { AnimatePresence, motion } from 'framer-motion';

/**
 * 召回指示蜡烛 — DESIGN §8.6
 * SVG 22×34，泪滴形火焰 + 摇曳动画 + 暖橙发光
 * visible=true 淡入，false 淡出
 */

const CANDLE_CSS = `
  @keyframes we-flame-sway {
    0%   { transform: rotate(-2deg) scaleX(1);    }
    28%  { transform: rotate(1.6deg) scaleX(0.97); }
    55%  { transform: rotate(-1.2deg) scaleX(1.02);}
    78%  { transform: rotate(2.1deg) scaleX(0.98); }
    100% { transform: rotate(-2deg) scaleX(1);    }
  }
  @keyframes we-flame-core {
    0%,  100% { transform: scaleY(1)    scaleX(1);    }
    35%       { transform: scaleY(0.94) scaleX(1.04); }
    68%       { transform: scaleY(1.05) scaleX(0.96); }
  }
  @keyframes we-flame-outer-flicker {
    0%,  100% { opacity: 0.95; }
    22%       { opacity: 0.88; }
    55%       { opacity: 0.97; }
    78%       { opacity: 0.85; }
  }
  @keyframes we-glow-breathe {
    0%,  100% { opacity: 0.42; transform: scale(1);    }
    50%       { opacity: 0.70; transform: scale(1.12); }
  }
  .we-cf-sway {
    transform-box: fill-box;
    transform-origin: center bottom;
    animation: we-flame-sway 2.7s ease-in-out infinite;
  }
  .we-cf-core {
    transform-box: fill-box;
    transform-origin: center bottom;
    animation: we-flame-core 1.15s ease-in-out infinite;
  }
  .we-cf-flicker {
    animation: we-flame-outer-flicker 1.8s ease-in-out infinite;
  }
  .we-cf-glow {
    transform-box: fill-box;
    transform-origin: center center;
    animation: we-glow-breathe 2.0s ease-in-out infinite;
  }
`;

export default function CandleFlame({ visible }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.72, y: 5 }}
          animate={{ opacity: 1, scale: 1,    y: 0 }}
          exit={{   opacity: 0, scale: 0.68,  y: 3 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            zIndex: 30,
            pointerEvents: 'none',
            /* 双层发光：近焦橙 + 远焦暖晕 */
            filter:
              'drop-shadow(0 0 4px rgba(245,166,35,0.65))' +
              ' drop-shadow(0 0 11px rgba(232,131,74,0.30))',
          }}
        >
          <style>{CANDLE_CSS}</style>
          <svg
            width="22"
            height="34"
            viewBox="0 0 22 34"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* 外焰：底部暖黄→顶部橙红渐出 */}
              <radialGradient
                id="weCfOuter"
                cx="50%" cy="70%" r="58%"
                fx="50%" fy="80%"
              >
                <stop offset="0%"   stopColor="#fff9c4" />
                <stop offset="22%"  stopColor="#ffd54f" />
                <stop offset="58%"  stopColor="#f5a623" />
                <stop offset="100%" stopColor="#e8834a" stopOpacity="0.5" />
              </radialGradient>

              {/* 内芯：近白偏黄 */}
              <radialGradient
                id="weCfCore"
                cx="50%" cy="62%" r="50%"
              >
                <stop offset="0%"   stopColor="#fffde7" />
                <stop offset="42%"  stopColor="#fff9c4" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#fff176" stopOpacity="0.65" />
              </radialGradient>

              {/* 烛身：侧面明暗 */}
              <linearGradient id="weCfWax" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor="#b87444" />
                <stop offset="25%"  stopColor="#e4be6a" />
                <stop offset="62%"  stopColor="#d2a24c" />
                <stop offset="100%" stopColor="#a86838" />
              </linearGradient>

              {/* 地面光晕 */}
              <radialGradient id="weCfGround" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor="#f5a623" stopOpacity="0.52" />
                <stop offset="100%" stopColor="#f5a623" stopOpacity="0"   />
              </radialGradient>
            </defs>

            {/* ── 地面暖光（呼吸动画） ── */}
            <ellipse
              className="we-cf-glow"
              cx="11" cy="33" rx="7.5" ry="1.8"
              fill="url(#weCfGround)"
            />

            {/* ── 烛身 ── */}
            <rect
              x="8.5" y="24.5" width="5" height="8"
              rx="0.5" fill="url(#weCfWax)"
            />
            {/* 烛顶蜡池 */}
            <ellipse
              cx="11" cy="24.5" rx="2.5" ry="0.65"
              fill="#edcb68" opacity="0.88"
            />
            {/* 烛身高光细条 */}
            <rect
              x="10.6" y="25" width="0.7" height="6.5"
              rx="0.35" fill="white" opacity="0.10"
            />

            {/* ── 灯芯（微弯） ── */}
            <path
              d="M11 22.5 C10.6 23, 10.7 23.7, 11 24.5"
              stroke="#3a2315" strokeWidth="0.7"
              strokeLinecap="round" fill="none"
            />

            {/* ── 火焰（摇曳整体） ── */}
            <g className="we-cf-sway">

              {/* 外焰：宽泪滴 */}
              <path
                className="we-cf-flicker"
                d={[
                  'M 11,23.5',
                  'C  7.2,18.5  5,12.5  6.8,7.2',
                  'C  8,3.8   9.8,1.2  11,0.8',
                  'C  12.2,1.2 14,3.8  15.2,7.2',
                  'C  17,12.5 14.8,18.5 11,23.5 Z',
                ].join(' ')}
                fill="url(#weCfOuter)"
              />

              {/* 中层：加深橙黄感 */}
              <path
                d={[
                  'M 11,22.5',
                  'C  8.8,18  7.8,13.5  9,9.8',
                  'C  9.8,7  10.6,5.2  11,4.8',
                  'C  11.4,5.2 12.2,7  13,9.8',
                  'C  14.2,13.5 13.2,18 11,22.5 Z',
                ].join(' ')}
                fill="#ffd54f"
                opacity="0.52"
              />

              {/* 内芯：细高白芯（独立闪烁） */}
              <path
                className="we-cf-core"
                d={[
                  'M 11,21.5',
                  'C  9.8,18  9.6,14.8  10.2,11.8',
                  'C  10.6,9.4  11,8  11,7.5',
                  'C  11,8  11.4,9.4  11.8,11.8',
                  'C  12.4,14.8 12.2,18 11,21.5 Z',
                ].join(' ')}
                fill="url(#weCfCore)"
              />

              {/* 顶部高光点 */}
              <ellipse
                cx="11" cy="2" rx="0.65" ry="0.95"
                fill="white" opacity="0.62"
              />
            </g>
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
