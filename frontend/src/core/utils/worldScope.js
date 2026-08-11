/**
 * 从当前路由推断「所在世界」与「所在角色对话」的 id，以及是否处于抽屉/浮层路由上。
 * 供 TopBar（世界名显示）和世界主色注入（core/features/worldAccent）共用，
 * 避免两处各写一份正则judge 路由的逻辑。
 */

// 抽屉/浮层路由：不应影响"当前世界"判断——镜像 AppRouter 里的背景 <Routes> 块。
const OVERLAY_PATTERNS = [
  /^\/worlds\/new$/,
  /^\/worlds\/[\w-]+\/edit$/,
  /^\/worlds\/[\w-]+\/persona$/,
  /^\/worlds\/[\w-]+\/characters\/new$/,
  /^\/characters\/[\w-]+\/edit$/,
  /^\/settings$/,
];

// 全局浮层：和任何具体世界无关，无论从书架还是从世界内页面打开，都不落入世界作用域。
// 必须比 backgroundLocation 分支先判断——否则从世界内页面打开时 bg 是该世界页面，
// 会被误判成"在世界内"，继承世界主色（缺陷一）。
const GLOBAL_OVERLAY_PATTERNS = [
  /^\/settings$/,
];

// 世界内浮层：路径自带 :worldId，应按自己的路径定位所在世界，不该跟着
// backgroundLocation 漂移。这类浮层的唯一入口是书架卡片（bg 恒为书架 '/'），
// 若走 bg 分支会永远判定为不在任何世界内，用户在这页配色却看不到配色效果（缺陷二）。
const WORLD_SELF_SCOPED_PATTERNS = [
  /^\/worlds\/[\w-]+\/edit$/,
];

export function extractIds(pathname) {
  const charChat = pathname.match(/\/characters\/([\w-]+)\/chat/);
  const worldWriting = pathname.match(/\/worlds\/([\w-]+)/);
  return {
    characterId: charChat?.[1] ?? null,
    worldId: worldWriting?.[1] ?? null,
  };
}

/**
 * 解出「有效路由路径」：浮层打开时用背景页路径；否则命中 OVERLAY_PATTERNS 的路径
 * （如 /worlds/new、/settings）一律视为书架层（'/'）。
 */
export function resolveTopbarPathname(location) {
  if (GLOBAL_OVERLAY_PATTERNS.some((re) => re.test(location.pathname))) return '/';
  if (WORLD_SELF_SCOPED_PATTERNS.some((re) => re.test(location.pathname))) return location.pathname;
  const bg = location.state?.backgroundLocation;
  if (bg) return bg.pathname;
  if (OVERLAY_PATTERNS.some((re) => re.test(location.pathname))) return '/';
  return location.pathname;
}

/**
 * 是否处于「书架层」（世界列表本身，不属于任何世界）。
 */
export function isBookshelfPathname(pathname) {
  return pathname === '/';
}
