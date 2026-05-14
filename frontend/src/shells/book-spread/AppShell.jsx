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
 * `./layout` and `./components` and MUST NOT be imported by pages directly.
 */
import TopBar from './components/TopBar.jsx';
import PageTransition from './transitions/PageTransition.jsx';
import GlobalToast from '../../components/ui/GlobalToast.jsx';
import { PageLayoutRendererProvider } from '../../pages/layout/PageLayout.jsx';
import renderPageLayout from './layout/pageLayoutRenderer.jsx';

export default function AppShell({ children, locationKey }) {
  return (
    <div className="we-app-root we-shell-book-spread">
      <TopBar />
      <GlobalToast />
      <PageLayoutRendererProvider render={renderPageLayout}>
        <PageTransition locationKey={locationKey}>
          {children}
        </PageTransition>
      </PageLayoutRendererProvider>
    </div>
  );
}
