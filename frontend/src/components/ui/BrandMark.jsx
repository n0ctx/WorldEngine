/**
 * 品牌标识「骰界」：二十面骰正视图，正对你的那一面走强调色——每个世界都是掷出来的一面。
 * 主体跟 currentColor；20px 以下去掉内部棱线，只留外轮廓和正面。
 * 网页小图标是同一图形的固定配色版：public/favicon.svg。
 */

const HEX = [
  [16, 2.5], [27.7, 9.25], [27.7, 22.75], [16, 29.5], [4.3, 22.75], [4.3, 9.25],
];
const FACE = [[16, 9], [22.6, 20.4], [9.4, 20.4]];
const [TOP, RIGHT, LEFT] = FACE;
// 正面三个角各连到外圈相邻的三个角
const EDGES = [
  [HEX[0], TOP], [HEX[1], TOP], [HEX[5], TOP],
  [HEX[1], RIGHT], [HEX[2], RIGHT], [HEX[3], RIGHT],
  [HEX[5], LEFT], [HEX[4], LEFT], [HEX[3], LEFT],
];

function points(list) {
  return list.map(([x, y]) => `${x},${y}`).join(' ');
}

export default function BrandMark({ size = 20, className }) {
  const compact = size < 20;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true" focusable="false">
      <polygon points={points(FACE)} fill="currentColor" className="we-icon-accent" />
      {!compact && EDGES.map(([a, b]) => (
        <line key={`${a}-${b}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      ))}
      <polygon points={points(FACE)} stroke="currentColor" strokeWidth={compact ? 2 : 1.75} strokeLinejoin="round" />
      <polygon points={points(HEX)} stroke="currentColor" strokeWidth={compact ? 3 : 2.5} strokeLinejoin="round" />
    </svg>
  );
}
