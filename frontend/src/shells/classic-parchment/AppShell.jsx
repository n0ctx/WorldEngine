/**
 * Classic Parchment shell — default app frame.
 *
 * Owns global chrome (top bar, toast region) and the page transition wrapper.
 * Does NOT own routes, app state, or domain logic — those live in
 * `core/app/AppRoot.jsx` and the page tree.
 *
 * Pages may describe layout neutrally via `core/layout/PageLayout`; this
 * shell renders those slots in its parchment two-page style. Pages that
 * currently use shell-themed primitives directly (BookSpread, PageLeft,
 * PageRight, etc. under `components/book/`) are considered implementation
 * details of this shell and will be migrated to slot-based composition as
 * a follow-up.
 */
import TopBar from './components/TopBar.jsx';
import PageTransition from './transitions/PageTransition.jsx';
import GlobalToast from '../../components/ui/GlobalToast.jsx';

export default function AppShell({ children, locationKey }) {
  return (
    <div className="we-app-root we-shell-classic-parchment">
      <TopBar />
      <GlobalToast />
      <PageTransition locationKey={locationKey}>
        {children}
      </PageTransition>
    </div>
  );
}
