/**
 * 进入世界的页面转场（动效位 world-portal）：世界卡点击 → 旧页退出 → 路由切换 → 新页入场。
 * 转场跨过路由切换，起点（WorldsPage）、遮罩（AppShell）、终点（CharactersPage）在三处，
 * 状态存在这个模块级小仓库里；时间轴（navigate / total）在动效包的 portal 字段，编排在 themes/motion/<id>.css。
 * 转场进行中 getPortal() 是起点交给遮罩的细节：worldId 是点下的世界，shards 是卡片崩散的碎块（只有 traits.shatter 的包给）；
 * 没有转场时是 null。
 */

let active = null;
const listeners = new Set();

export function getPortal() {
  return active;
}

export function subscribePortal(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startPortal(detail = {}) {
  active = detail;
  for (const listener of listeners) listener();
}

export function endPortal() {
  if (!active) return;
  active = null;
  for (const listener of listeners) listener();
}
