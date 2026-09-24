/**
 * Book-spread shell — default app frame.
 *
 * Owns global chrome (top bar, toast region), the page transition wrapper,
 * and the PageLayout slot renderer that arranges page slots inside the
 * book two-page spread.
 *
 * Pages MUST express layout via `pages/layout/PageLayout` slots; this shell
 * decides the spread-specific visual composition. Shell-internal chrome
 * (BookSpread / PageLeft / PageRight / MemoryRecallOverlay) lives under
 * `./layout` and `./chrome` and MUST NOT be imported by pages directly.
 */
import { MotionConfig } from 'framer-motion';
import TopBar from './chrome/TopBar.jsx';
import PageTransition from './transitions/PageTransition.jsx';
import GlobalToast from '../../components/ui/GlobalToast.jsx';
import { PageLayoutRendererProvider } from '../../pages/layout/PageLayout.jsx';
import RenderPageLayout from './layout/pageLayoutRenderer.jsx';
import { useWorldAccentVars } from '../../core/features/worldAccent/useWorldAccentVars.js';

export default function AppShell({ children, locationKey }) {
  // 「封面即光源」：进入某个世界后，把该世界的主色注入成 CSS 变量覆盖 --we-color-accent 一系。
  // 书架层 / 无主色 / 浅色主题下返回 null，不注入，页面用主题自身默认色。
  const worldAccentVars = useWorldAccentVars();

  // reducedMotion="user"：系统要求减少动效时，所有 framer 动画关闭位移与缩放，只保留透明度
  return (
    <MotionConfig reducedMotion="user">
      <div className="we-app-root we-shell-book-spread" style={worldAccentVars ?? undefined}>
        <a href="#we-main-content" className="we-skip-link">跳到主内容</a>
        <TopBar />
        <GlobalToast />
        <PageLayoutRendererProvider render={RenderPageLayout}>
          <PageTransition locationKey={locationKey}>
            {children}
          </PageTransition>
        </PageLayoutRendererProvider>
      </div>
    </MotionConfig>
  );
}
