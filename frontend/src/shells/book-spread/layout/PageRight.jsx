/* Pure visual wrapper for the right page of the book-spread two-page layout. */
export default function PageRight({ children, className = '', flush = false }) {
  return (
    <div
      className={['we-page-right', flush ? 'we-page-right--flush' : '', className].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}
