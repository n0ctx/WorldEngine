/**
 * 路由加载占位 — skeleton 骨架屏。
 * 在 Suspense fallback 或路由切换过渡时使用。
 *
 * 外层 .we-route-fallback 负责撑满视口（min-height: 100svh）并延迟淡入：
 * 本地加载通常几百毫秒内完成，立即出现的骨架只会一闪而过。
 * 内层 .we-skeleton-container 负责骨架布局（column flex + gap + padding）。
 * 视觉装饰块统一 aria-hidden，避免屏幕阅读器读出；外层 role=status +
 * aria-label 让屏幕阅读器播报一次"加载中"。
 */
export default function RouteFallback() {
  return (
    <div className="we-route-fallback" role="status" aria-label="加载中">
      <div className="we-skeleton-container" aria-hidden="true">
        {/* 模拟页面标题 */}
        <div className="we-skeleton-block we-skeleton-block--lg we-skeleton-block--w-40" />
        {/* 模拟描述行 */}
        <div className="we-skeleton-block we-skeleton-block--w-70" />
        <div className="we-skeleton-block we-skeleton-block--w-55" />
      </div>
    </div>
  );
}
