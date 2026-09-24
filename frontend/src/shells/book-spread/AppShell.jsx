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
import { LucideProvider } from 'lucide-react';
import TopBar from './chrome/TopBar.jsx';
import PageTransition from './transitions/PageTransition.jsx';
import GlobalToast from '../../components/ui/GlobalToast.jsx';
import { PageLayoutRendererProvider } from '../../pages/layout/PageLayout.jsx';
import RenderPageLayout from './layout/pageLayoutRenderer.jsx';
import { useWorldAccentVars } from '../../core/features/worldAccent/useWorldAccentVars.js';
import useStore from '../../core/state/index.js';
import AtmosphereLayer from './atmosphere/AtmosphereLayer.jsx';

// 长时间阅读的页面：氛围压到最低，只留在边缘
const QUIET_SCENE = /\/chat$|\/writing$/;

export default function AppShell({ children, locationKey }) {
  // 「封面即光源」：进入某个世界后，把该世界的主色注入成 CSS 变量覆盖 --we-color-accent 一系。
  // 书架层 / 无主色 / 浅色主题下返回 null，不注入，页面用主题自身默认色。
  const worldAccentVars = useWorldAccentVars();
  // 氛围色：书架页悬停某个入口时临时取那个世界的主色，世界内取注入的世界主色，否则用主题 token。
  // 必须在这里显式写 --we-atmosphere-color：:root 上的 var(--we-color-accent) 引用在 :root 就已算定，
  // 不会跟着这里覆盖的 --we-color-accent 变。
  const ambientTint = useStore((s) => s.ambientTint);
  const atmosphereColor = ambientTint ?? worldAccentVars?.['--we-color-accent'] ?? null;
  const rootVars = atmosphereColor
    ? { ...worldAccentVars, '--we-atmosphere-color': atmosphereColor }
    : worldAccentVars;

  // reducedMotion="user"：系统要求减少动效时，所有 framer 动画关闭位移与缩放，只保留透明度
  // Lucide 图标统一细描边：24 视口下 1.75，20 / 16 尺寸按比例缩放，整站线重一致
  return (
    <MotionConfig reducedMotion="user">
      <LucideProvider strokeWidth={1.75}>
      <div className="we-app-root we-shell-book-spread" style={rootVars ?? undefined}>
        <AtmosphereLayer
          quiet={QUIET_SCENE.test(locationKey)}
          colorKey={atmosphereColor ?? ''}
        />
        <a href="#we-main-content" className="we-skip-link">跳到主内容</a>
        <TopBar />
        <GlobalToast />
        <PageLayoutRendererProvider render={RenderPageLayout}>
          <PageTransition locationKey={locationKey}>
            {children}
          </PageTransition>
        </PageLayoutRendererProvider>
      </div>
      </LucideProvider>
    </MotionConfig>
  );
}
