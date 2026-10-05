import { useId, useMemo } from 'react';
import { buildWorldScene } from '../../core/utils/worldScene.js';

// 水纹：由外到内四圈，越靠岸越清楚
const WATERLINES = [[30, 0.16], [21, 0.24], [13, 0.34], [6, 0.5]];
const COMPASS_TICKS = Array.from({ length: 32 }, (_, i) => i * 11.25);
const QUARTERS = [0, 90, 180, 270];

// 罗盘玫瑰：四个主向长、四个次向短，每根指针一半实墨一半留白；北向一半走红
function Compass({ x, y, s }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g stroke={s.land[0]} strokeOpacity="0.16">
        {s.rhumbs.map((deg) => <line key={deg} x1="0" y1="0" x2={s.width * 1.2} y2="0" transform={`rotate(${deg})`} />)}
      </g>
      <circle r="24" fill={s.land[0]} stroke={s.ink} strokeWidth="1.2" />
      <circle r="20" fill="none" stroke={s.ink} strokeWidth="0.6" />
      <g stroke={s.ink} strokeWidth="0.6">
        {COMPASS_TICKS.map((deg) => <line key={deg} x1="0" y1={deg % 45 ? -21 : -22.5} x2="0" y2="-20" transform={`rotate(${deg})`} />)}
      </g>
      {QUARTERS.map((deg) => (
        <g key={`minor${deg}`} transform={`rotate(${deg + 45})`} strokeWidth="0.7" stroke={s.ink} strokeLinejoin="round">
          <path d="M0,-15 L3,-3 L0,0 Z" fill={s.ink} />
          <path d="M0,-15 L-3,-3 L0,0 Z" fill={s.land[0]} />
        </g>
      ))}
      {QUARTERS.map((deg) => (
        <g key={`major${deg}`} transform={`rotate(${deg})`} strokeWidth="0.8" stroke={s.ink} strokeLinejoin="round">
          <path d="M0,-21 L4.5,-4 L0,0 Z" fill={deg === 0 ? s.red : s.ink} />
          <path d="M0,-21 L-4.5,-4 L0,0 Z" fill={s.land[0]} />
        </g>
      ))}
      <circle r="2.2" fill={s.land[0]} stroke={s.ink} strokeWidth="0.8" />
      <text y="-28" textAnchor="middle" fontSize="9" fontWeight="700" fill={s.land[0]} className="we-world-scene__letter">N</text>
      {/* 比例尺：四格黑白相间 */}
      <g transform="translate(-20 33)" stroke={s.land[0]} strokeWidth="0.8">
        {[0, 1, 2, 3].map((i) => <rect key={i} x={i * 10} y="0" width="10" height="3.5" fill={i % 2 ? 'none' : s.land[0]} />)}
      </g>
    </g>
  );
}

function Ship({ x, y, s }) {
  return (
    <g transform={`translate(${x} ${y}) scale(1.2)`} stroke={s.land[0]} strokeLinejoin="round" strokeLinecap="round">
      <path d="M-17,4 h-5 M-15,7 h-6" fill="none" strokeWidth="0.9" strokeOpacity="0.6" />
      <path d="M-10,0 H10 L7,4.5 H-7 Z" fill={s.land[0]} strokeWidth="0.8" />
      <path d="M-1,0 V-17" fill="none" strokeWidth="1.1" />
      <path d="M0.2,-16 L8.5,-2 H0.2 Z" fill={s.land[0]} strokeWidth="0.6" />
      <path d="M-2.2,-12 L-8,-2 H-2.2 Z" fill="none" strokeWidth="1" />
      <path d="M-1,-17 l4.5,1.5 -4.5,1.5 Z" fill={s.red} stroke="none" />
    </g>
  );
}

// 海蛇：三道拱起的身子和一个回头的脑袋，水面上几笔浪
function Serpent({ x, y, s }) {
  return (
    <g transform={`translate(${x} ${y}) scale(1.4)`} fill="none" stroke={s.land[0]} strokeWidth="1.4" strokeLinecap="round">
      <path d="M-16,0 a4,4 0 0 1 8,0 M-5,0 a4.5,4.5 0 0 1 9,0 M7,0 q1,-10 7,-10 q4,0 4,4 l-3,1" />
      <circle cx="15" cy="-8" r="0.6" fill={s.land[0]} stroke="none" />
      <path d="M-20,2.5 q2,-1.6 4,0 t4,0 M-1,2.5 q2,-1.6 4,0 t4,0 M10,2.5 q2,-1.6 4,0" strokeWidth="0.9" strokeOpacity="0.7" />
    </g>
  );
}

function Mountain({ x, y, size, s }) {
  const w = size * 1.25;
  const top = y - size * 1.5;
  return (
    <g>
      <path d={`M${x - w},${y} L${x},${top} L${x + w},${y} Z`} fill={s.land[0]} />
      <path d={`M${x},${top} L${x + w},${y} L${x + size * 0.2},${y} Z`} fill={s.ink} fillOpacity="0.82" />
      <path d={`M${x - w},${y} L${x},${top} L${x + w},${y}`} fill="none" stroke={s.ink} strokeWidth="1" strokeLinejoin="round" />
      <path d={`M${x - w * 0.55},${y - 1.5} l2,-2 M${x - w * 0.35},${y - 1.5} l2,-2`} stroke={s.ink} strokeWidth="0.6" strokeOpacity="0.7" />
    </g>
  );
}

// 丘陵：一道小拱，背光一侧压两笔短线
function Hill({ x, y, s }) {
  return (
    <g fill="none" stroke={s.ink} strokeLinecap="round">
      <path d={`M${x - 5},${y} q5,-6.5 10,0`} strokeWidth="0.9" />
      <path d={`M${x + 1.5},${y - 2.2} l1.6,1.6 M${x + 3},${y - 1} l1.2,1`} strokeWidth="0.6" strokeOpacity="0.75" />
    </g>
  );
}

function Tree({ x, y, r, s }) {
  return (
    <g>
      <path d={`M${x},${y} v${r + 1.6}`} stroke={s.ink} strokeWidth="0.9" />
      <circle cx={x} cy={y} r={r} fill={s.canopy} stroke={s.ink} strokeWidth="0.8" />
      <path d={`M${x + r * 0.15},${y + r * 0.85} a${r},${r} 0 0 0 ${r * 0.8},${-r * 1.2}`} fill="none" stroke={s.ink} strokeWidth="1.2" strokeOpacity="0.5" />
    </g>
  );
}

// 第一座是城堡（插红旗），其余是两间小屋
function Town({ x, y, capital, s }) {
  return (
    <g transform={`translate(${x} ${y})`} stroke={s.ink} strokeWidth="1" strokeLinejoin="round">
      {capital ? (
        <>
          <path d="M-8,5 V-3 h2 v-2 h2 v2 h2 v-2 h4 v2 h2 v-2 h2 v2 h2 V5 Z" fill={s.land[0]} />
          <path d="M-2,-5 V-11 h4 V-5" fill={s.land[0]} />
          <path d="M0,-11 V-17" fill="none" />
          <path d="M0,-17 l5,1.6 -5,1.6 Z" fill={s.red} stroke="none" />
          <path d="M-2,5 V1 a2,2 0 0 1 4,0 V5" fill={s.ink} />
        </>
      ) : (
        <>
          <path d="M-7,4 V-1 L-4.5,-3.5 L-2,-1 V4 Z" fill={s.land[0]} />
          <path d="M-1,4 V-2 L2.5,-5.5 L6,-2 V4 Z" fill={s.land[0]} />
          <path d="M-1,-2 L2.5,-5.5 L6,-2" fill="none" strokeWidth="1.6" />
        </>
      )}
    </g>
  );
}

// 河：越往下游越宽，墨线描边、水色填心
function River({ points, s }) {
  if (points.length < 2) return null;
  const third = Math.ceil(points.length / 3);
  const parts = [0, 1, 2].map((i) => points.slice(i * third, (i + 1) * third + 1)).filter((part) => part.length > 1);
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {parts.map((part, i) => <polyline key={`ink${i}`} points={part.join(' ')} stroke={s.ink} strokeWidth={2.4 + i * 0.9} />)}
      {parts.map((part, i) => <polyline key={`water${i}`} points={part.join(' ')} stroke={s.water} strokeWidth={1 + i * 0.9} />)}
    </g>
  );
}

// 三种用法：card 世界卡，带图框；banner 对话、写作页顶上的台前横幅，宽镜头、顶边对齐（下沿淡进纸面、写着名字）；
// backdrop 正文中间栏的氛围底图，同一张图只留海、岸和山林——它铺在正文后面、常被放大裁切，
// 图框、罗盘、船、城镇与航路这些标注会压在字上
const VARIANTS = {
  card: { layout: 'card', frame: true, notes: true, align: 'xMidYMid slice' },
  banner: { layout: 'banner', frame: false, notes: true, align: 'xMidYMin slice' },
  backdrop: { layout: 'card', frame: false, notes: false, align: 'xMidYMid slice' },
};

// 无封面世界的场景画「古地图」：按世界名稳定生成，铺满父容器（裁切而非留边）
export default function WorldSceneArt({ name, className, variant = 'card' }) {
  const { layout, frame, notes, align } = VARIANTS[variant];
  const s = useMemo(() => buildWorldScene(name, layout), [name, layout]);
  const id = useId();
  const g = (key) => `${id}-${key}`;
  const W = s.width;
  const H = s.height;
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio={align} aria-hidden="true" data-scene-hue={s.hue}>
      <defs>
        {/* 用画布坐标：水纹描边也取同一套海色，才能和底下的海接上 */}
        <radialGradient id={g('sea')} gradientUnits="userSpaceOnUse" cx={W / 2} cy={H * 0.45} r={W * 0.62}>
          <stop offset="0" stopColor={s.sea[0]} />
          <stop offset="1" stopColor={s.sea[1]} />
        </radialGradient>
        <linearGradient id={g('land')} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2={H}>
          <stop offset="0" stopColor={s.land[0]} />
          <stop offset="1" stopColor={s.land[1]} />
        </linearGradient>
        <filter id={g('rough')} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3" />
        </filter>
        <filter id={g('grain')}>
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 -0.3" />
        </filter>
        <clipPath id={g('land-clip')}>
          {s.islands.map((d) => <path key={d} d={d} />)}
        </clipPath>
      </defs>
      <rect width={W} height={H} fill={`url(#${g('sea')})`} />
      <g fill="none" stroke={s.waterline} strokeOpacity="0.5" strokeWidth="0.9" strokeLinecap="round">
        {s.marks.map((p) => <path key={`${p.x}-${p.y}`} d={`M${p.x - 6},${p.y} q3,-3 6,0 t6,0`} />)}
      </g>
      {notes && s.ships.map((p) => <Ship key={`${p.x}-${p.y}`} x={p.x} y={p.y} s={s} />)}
      {notes && s.serpent && <Serpent x={s.serpent.x} y={s.serpent.y} s={s} />}
      <g filter={`url(#${g('rough')})`}>
        {WATERLINES.map(([width, opacity]) => (
          <g key={width} fill="none" strokeLinejoin="round">
            {s.islands.map((d) => <path key={d} d={d} stroke={s.waterline} strokeOpacity={opacity} strokeWidth={width} />)}
            {s.islands.map((d) => <path key={d} d={d} stroke={`url(#${g('sea')})`} strokeWidth={width - 1.6} />)}
          </g>
        ))}
        {s.islands.map((d) => <path key={d} d={d} fill={`url(#${g('land')})`} />)}
        <g clipPath={`url(#${g('land-clip')})`} fill="none">
          {s.islands.map((d) => <path key={d} d={d} stroke={s.shore} strokeOpacity="0.55" strokeWidth="9" />)}
        </g>
        {s.islands.map((d) => <path key={d} d={d} fill="none" stroke={s.ink} strokeWidth="1.5" strokeLinejoin="round" />)}
        {s.lake && (
          <>
            <path d={s.lake} fill={s.water} stroke={s.ink} strokeWidth="1.1" />
            <path d={s.lake} fill="none" stroke={s.waterline} strokeOpacity="0.5" strokeWidth="0.7" transform="translate(0 1.2)" />
          </>
        )}
      </g>
      <River points={s.river} s={s} />
      {s.hills.map((p) => <Hill key={`${p.x}-${p.y}`} x={p.x} y={p.y} s={s} />)}
      {s.trees.map((t) => <Tree key={`${t.x}-${t.y}`} x={t.x} y={t.y} r={t.r} s={s} />)}
      {s.peaks.map((p) => <Mountain key={`${p.x}-${p.y}`} x={p.x} y={p.y} size={p.s} s={s} />)}
      {notes && (
        <>
          <path d={s.route} fill="none" stroke={s.red} strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
          {s.towns.map((t, i) => <Town key={`${t.x}-${t.y}`} x={t.x} y={t.y} capital={i === 0} s={s} />)}
          {s.goal && s.towns.length > 1 && (
            <path d={`M${s.goal.x - 3.5},${s.goal.y - 14.5} l7,7 m0,-7 l-7,7`} stroke={s.red} strokeWidth="2" strokeLinecap="round" />
          )}
          <Compass x={s.compass.x} y={s.compass.y} s={s} />
        </>
      )}
      {frame && (
        <>
          <rect x="8" y="8" width={W - 16} height={H - 16} fill="none" stroke={s.land[0]} strokeWidth="1.2" />
          <rect x="13" y="13" width={W - 26} height={H - 26} fill="none" stroke={s.land[0]} strokeWidth="0.8" />
          <g fill={s.land[0]} fillOpacity="0.85">
            {s.frame.map((seg) => <rect key={`${seg.x}-${seg.y}`} x={seg.x} y={seg.y} width={seg.w} height={seg.h} />)}
          </g>
        </>
      )}
      <rect width={W} height={H} filter={`url(#${g('grain')})`} opacity="0.14" />
    </svg>
  );
}
