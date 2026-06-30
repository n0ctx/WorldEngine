/**
 * 弹幕层 —— 顶部栏单行滚动弹幕彩蛋（B 站式跑马灯）。
 *
 * 纯展示组件：把「最新一条 AI 回复」的弹幕在顶部栏中间单行从右向左持续循环滚动。
 * 所有弹幕排在同一行（flex + gap，彼此不重叠），整条轨道无缝循环（内容复制两份，
 * 平移 -50% 实现接缝无空档）。颜色由前端按索引取 token 色板。
 *
 * @param {{ items: string[], tick: number } | null} comments 当前要展示的弹幕
 * @param {'slow'|'normal'|'fast'} speed 滚动速度（每条弹幕占用的秒数，决定整条轨道时长）
 */
const SECONDS_PER_ITEM = { slow: 4.5, normal: 3, fast: 1.8 };
const PALETTE_SIZE = 7; // 与 tokens.css --we-danmaku-1..7 对应

export default function DanmakuLayer({ comments, speed = 'normal' }) {
  const items = comments?.items;
  if (!Array.isArray(items) || items.length === 0) return null;

  const bullets = items.map((raw) => String(raw ?? '').trim()).filter(Boolean);
  if (bullets.length === 0) return null;

  const perItem = SECONDS_PER_ITEM[speed] ?? SECONDS_PER_ITEM.normal;
  const duration = Math.max(8, bullets.length * perItem);
  // 复制两份实现无缝循环（轨道平移 -50% 时第二份正好接上第一份）
  const loop = [...bullets, ...bullets];

  return (
    <div className="we-danmaku-band" aria-hidden="true">
      <div
        className="we-danmaku-track"
        key={comments.tick}
        style={{ animationDuration: `${duration}s` }}
      >
        {loop.map((text, i) => (
          <span
            key={i}
            className="we-danmaku-bullet"
            style={{ '--we-danmaku-color': `var(--we-danmaku-${(i % bullets.length % PALETTE_SIZE) + 1})` }}
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
