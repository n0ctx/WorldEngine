/**
 * Classic Parchment shell — default app frame.
 *
 * Owns global chrome (top bar, toast region), the page transition wrapper,
 * and the PageLayout slot renderer that arranges page slots inside the
 * parchment two-page spread.
 *
 * Pages MUST express layout via `core/layout/PageLayout` slots; this shell
 * decides the parchment-specific visual composition. Shell-internal chrome
 * (BookSpread / PageLeft / PageRight / MemoryRecallOverlay) lives under
 * `./layout` and `./components` and MUST NOT be imported by pages directly.
 */
import TopBar from './components/TopBar.jsx';
import PageTransition from './transitions/PageTransition.jsx';
import GlobalToast from '../../components/ui/GlobalToast.jsx';
import { PageLayoutRendererProvider } from '../../core/layout/PageLayout.jsx';
import BookSpread from './layout/BookSpread.jsx';
import PageLeft from './layout/PageLeft.jsx';
import PageRight from './layout/PageRight.jsx';
import MemoryRecallOverlay from './components/MemoryRecallOverlay.jsx';

function renderPageLayout({
  header = null,
  left = null,
  main = null,
  right = null,
  inspector = null,
  overlay = null,
  recall = null,
}) {
  return (
    <>
      <BookSpread>
        {left != null ? (
          <PageLeft recall={recall ? <MemoryRecallOverlay {...recall} /> : null}>
            {left}
          </PageLeft>
        ) : null}
        <PageRight className="!p-0">
          {header}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {main}
            {right}
            {inspector}
          </div>
        </PageRight>
      </BookSpread>
      {overlay}
    </>
  );
}

export default function AppShell({ children, locationKey }) {
  return (
    <div className="we-app-root we-shell-classic-parchment">
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
