/* Pure visual wrapper for the left page of the book-spread two-page layout.
 * Owned by book-spread shell. Content is supplied by the page via PageLayout
 * slots. The memory-recall overlay now lives in SideDrawer's `footer` (it must
 * stay visible even when this drawer is collapsed), not here.
 */
export default function PageLeft({ children, className = '' }) {
  return (
    <div className={['we-page-left', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
