/* DESIGN.md §5.3 §8.2
 * Pure visual wrapper for the left page of the parchment two-page spread.
 * Owned by book-spread shell. Content is supplied by the page via PageLayout
 * slots. The memory-recall overlay now lives in SideDrawer's `footer` (it must
 * stay visible even when this drawer is collapsed), not here.
 */
export default function PageLeft({ children, className = '' }) {
  return (
    <div className={['we-page-left', className].filter(Boolean).join(' ')}>
      {children}
      {/* 右侧书脊阴影 — 让中栏更像微微凸起的纸页 */}
      <div className="we-page-left-spine" />
    </div>
  );
}
