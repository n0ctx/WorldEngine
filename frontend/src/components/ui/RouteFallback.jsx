import Skeleton from './Skeleton.jsx';

/**
 * 路由加载占位 — skeleton 骨架屏。
 * 在 Suspense fallback 或路由切换过渡时使用。
 *
 * .we-route-fallback 负责撑满视口（min-height: 100svh）、留白并延迟淡入：
 * 本地加载通常几百毫秒内完成，立即出现的骨架只会一闪而过。
 * 骨架自带 role=status 与「加载中」说明，屏幕阅读器播报一次。
 */
export default function RouteFallback() {
  return (
    <div className="we-route-fallback">
      <Skeleton lines={[40, 70, 55]} />
    </div>
  );
}
