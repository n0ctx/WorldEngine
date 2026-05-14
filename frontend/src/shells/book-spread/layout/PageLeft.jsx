/* DESIGN.md §5.3 §8.2
 * Pure visual wrapper for the left page of the parchment two-page spread.
 * Owned by book-spread shell. Content + memory-recall overlay are
 * supplied by the page via PageLayout slots.
 */
export default function PageLeft({ children, recall = null, className = '' }) {
  return (
    <div className={['we-page-left', className].filter(Boolean).join(' ')}>
      {children}
      {recall}
      {/* 右侧书脊阴影 — 让中栏更像微微凸起的纸页 */}
      <div className="we-page-left-spine" />
    </div>
  );
}
