/**
 * Classic Parchment shell — PageLayout slot renderer.
 *
 * Extracted from AppShell so tests can install the real renderer via
 * `PageLayoutRendererProvider` without dragging in TopBar / GlobalToast /
 * PageTransition. Production code goes through AppShell.
 */
import BookSpread from './BookSpread.jsx';
import PageLeft from './PageLeft.jsx';
import PageRight from './PageRight.jsx';
import MemoryRecallOverlay from '../chrome/MemoryRecallOverlay.jsx';

export default function renderPageLayout({
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
        <PageRight flush>
          {header}
          <div className="we-page-right__body">
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
